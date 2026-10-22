#!/usr/bin/env python3
"""Pinned official Microsoft partitions, four workers, resumable receipts.

Only a point-grid/bounding-box candidate subset is exported. Raw source polygons
and holes are unchanged. Exact hole-aware PIP is performed by the next local step.
"""
import argparse,concurrent.futures,csv,datetime,gzip,hashlib,json,math,pathlib,re,time,urllib.request

REPO=pathlib.Path(__file__).resolve().parents[1]
INDEX_URL='https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv'
PINNED_INDEX_SHA='de61b569b0c23c364d61173632d8c5487ea30bf20912c55b9fa1ab4a89d01148'
VERSION='msml-point-bbox-v1'

def configure(work_dir,grocery_path):
    global HERE,INDEX,PARTITIONS,POINTS,POINT_SHA,INDEX_SHA,GRID,EXPECTED_SHA
    HERE=pathlib.Path(work_dir).resolve();INDEX=HERE/'microsoft-links.csv'
    INDEX_SHA=hashlib.sha256(INDEX.read_bytes()).hexdigest()
    if INDEX_SHA!=PINNED_INDEX_SHA:raise RuntimeError('Pinned source index checksum changed')
    with INDEX.open()as source:PARTITIONS=[r for r in csv.DictReader(source)if r['Location']=='Thailand']
    if len(PARTITIONS)!=142:raise RuntimeError('Pinned country partition coverage changed')
    grocery=json.loads(pathlib.Path(grocery_path).read_text())
    POINTS=[(r[0],r[5],r[6])for r in grocery['rows']]
    if len({r[0]for r in POINTS})!=len(POINTS):raise RuntimeError('Duplicate input point identity')
    POINT_SHA=hashlib.sha256(json.dumps(POINTS,separators=(',',':')).encode()).hexdigest()
    GRID={}
    for key,x,y in POINTS:
        if not math.isfinite(x)or not math.isfinite(y):raise RuntimeError('Invalid input point')
        GRID.setdefault((math.floor(x/.005),math.floor(y/.005)),[]).append((key,x,y))
    expected=json.loads((REPO/'data/building-sources.json').read_text())['sources']['microsoft']['partitions']
    EXPECTED_SHA={r['quadkey']:r['sha256']for r in expected}
    for name in ['microsoft-cache','microsoft-candidates','microsoft-receipts']:(HERE/name).mkdir(exist_ok=True)

def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest_file(path):
    h=hashlib.sha256()
    with path.open('rb')as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def size_limit(text):
    value,unit=re.fullmatch(r'([0-9.]+)([KMG]?B)',text).groups()
    return int(float(value)*{'B':1,'KB':1000,'MB':1000000,'GB':1000000000}[unit]*1.2+1000000)

def download(item):
    key=item['QuadKey'];url=item['Url'];path=HERE/'microsoft-cache'/(key+'.csv.gz');receipt_path=HERE/'microsoft-receipts'/(key+'.download.json')
    if path.exists()and receipt_path.exists():
        receipt=json.loads(receipt_path.read_text())
        if receipt.get('url')==url and receipt.get('sha256')==digest_file(path)==EXPECTED_SHA[key]:return path,receipt
    partial=path.with_suffix(path.suffix+'.partial')
    for attempt in range(4):
        try:
            offset=partial.stat().st_size if partial.exists()else 0
            headers={'User-Agent':'CityMETER licensed building-data download; source index 2026-08-13'}
            if offset:headers['Range']='bytes='+str(offset)+'-'
            with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=60)as response:
                append=bool(offset and response.status==206)
                if append and not response.headers.get('Content-Range','').startswith('bytes '+str(offset)+'-'):raise RuntimeError('Invalid resume content range')
                if not append:offset=0
                limit=size_limit(item['Size']);response_start=offset;expected_length=response.headers.get('Content-Length')
                with partial.open('ab'if append else'wb')as target:
                    while True:
                        chunk=response.read(1024*1024)
                        if not chunk:break
                        offset+=len(chunk)
                        if offset>limit:raise RuntimeError('partition exceeds its indexed-size safety bound')
                        target.write(chunk)
                if expected_length is not None and offset-response_start!=int(expected_length):raise RuntimeError('Incomplete source response')
                actual_sha=digest_file(partial)
                if actual_sha!=EXPECTED_SHA[key]:raise ValueError('Source partition differs from the pinned published checksum: '+key)
                receipt={'url':url,'quadkey':key,'release':'2026-08-13','bytes':offset,'sha256':actual_sha,'etag':response.headers.get('ETag'),'lastModified':response.headers.get('Last-Modified'),'completedOn':now(),'indexSHA256':INDEX_SHA}
            partial.replace(path);receipt_path.write_text(json.dumps(receipt,indent=2)+'\n')
            return path,receipt
        except ValueError:
            raise
        except Exception:
            if attempt==3:raise
            time.sleep(3*(attempt+1))

def coordinate_pairs(value):
    if not isinstance(value,list)or not value:return
    if isinstance(value[0],(int,float)):
        if len(value)>=2:yield value[0],value[1]
    else:
        for child in value:yield from coordinate_pairs(child)

def candidate_keys(w,s,e,n):
    a,b,c,d=math.floor(w/.005),math.floor(s/.005),math.floor(e/.005),math.floor(n/.005)
    if(c-a+1)*(d-b+1)>10000:pool=POINTS
    else:pool=(point for x in range(a,c+1)for y in range(b,d+1)for point in GRID.get((x,y),()))
    return[key for key,x,y in pool if w<=x<=e and s<=y<=n]

def process(item):
    key=item['QuadKey'];path,receipt=download(item)
    output=HERE/'microsoft-candidates'/(key+'.geojsonl');filter_receipt=HERE/'microsoft-receipts'/(key+'.filter.json')
    if output.exists()and filter_receipt.exists():
        cached=json.loads(filter_receipt.read_text())
        if cached.get('sourceSHA256')==receipt['sha256']and cached.get('pointSHA256')==POINT_SHA and cached.get('pipeline')==VERSION and cached.get('outputSHA256')==digest_file(output):return cached
    temp=output.with_suffix('.partial');stats={'quadkey':key,'url':item['Url'],'sourceSHA256':receipt['sha256'],'compressedBytes':receipt['bytes'],'indexSHA256':INDEX_SHA,'pointSHA256':POINT_SHA,'pipeline':VERSION,'sourceFeatures':0,'invalidOrUnsupported':0,'bboxCandidates':0,'unknownHeight':0,'estimatedHeight':0,'confidenceKnown':0}
    with gzip.open(path,'rb')as source,temp.open('w')as target:
        for line in source:
            if not line.strip():continue
            f=json.loads(line);stats['sourceFeatures']+=1;geometry=f.get('geometry')or{}
            if geometry.get('type')not in{'Polygon','MultiPolygon'}:stats['invalidOrUnsupported']+=1;continue
            coordinates=list(coordinate_pairs(geometry.get('coordinates')))
            if not coordinates or not all(math.isfinite(x)and math.isfinite(y)for x,y in coordinates):stats['invalidOrUnsupported']+=1;continue
            w=min(p[0]for p in coordinates);e=max(p[0]for p in coordinates);s=min(p[1]for p in coordinates);n=max(p[1]for p in coordinates)
            keys=candidate_keys(w,s,e,n)
            if not keys:continue
            props=f.get('properties')or{};raw_height=props.get('height');raw_confidence=props.get('confidence')
            height=float(raw_height)if isinstance(raw_height,(int,float))and not isinstance(raw_height,bool)and math.isfinite(raw_height)and raw_height>0 else None
            confidence=float(raw_confidence)if isinstance(raw_confidence,(int,float))and not isinstance(raw_confidence,bool)and math.isfinite(raw_confidence)and 0<=raw_confidence<=1 else None
            geometry_sha=hashlib.sha256(json.dumps(geometry,sort_keys=True,separators=(',',':')).encode()).hexdigest();building_id='msml-20260813:'+geometry_sha[:20]
            feature={'type':'Feature','id':building_id,'geometry':geometry,'properties':{'buildingId':building_id,'provider':'Microsoft GlobalMLBuildingFootprints','sourceRelease':'2026-08-13','sourcePartition':key,'sourceURL':item['Url'],'sourceFileSHA256':receipt['sha256'],'indexSHA256':INDEX_SHA,'sourceGeometrySHA256':geometry_sha,'sourceLineSHA256':hashlib.sha256(line).hexdigest(),'sourceFeatureId':f.get('id'),'height':height if height is not None else 3,'base':0,'sourceHeightM':height,'rawHeight':raw_height,'heightRole':'ml_height_estimate'if height is not None else'unknown_display_fallback','heightNote':'Source machine-learning height estimate; not surveyed.'if height is not None else'No usable source height; 3 m is display-only, not a measured building height.','confidence':confidence,'rawConfidence':raw_confidence,'confidenceRole':'footprint_detection_only','geometryRole':'ml_roofprint','license':'CDLA-Permissive-2.0','candidateStoreKeys':keys}}
            target.write(json.dumps(feature,separators=(',',':'))+'\n')
            stats['bboxCandidates']+=1;stats['estimatedHeight'if height is not None else'unknownHeight']+=1
            if confidence is not None:stats['confidenceKnown']+=1
    temp.replace(output);stats.update(outputBytes=output.stat().st_size,outputSHA256=digest_file(output),completedOn=now())
    filter_receipt.write_text(json.dumps(stats,indent=2)+'\n')
    return stats

def main():
    parser=argparse.ArgumentParser(description='Fetch the pinned Microsoft Thailand building release (~1.93GB), cache/resume four workers, and retain unchanged store-point bbox candidates. No data is downloaded on import.')
    parser.add_argument('--work-dir',required=True,help='Explicit cache/output directory outside this public repository')
    parser.add_argument('--grocery',default=str(REPO/'data/grocery.json'))
    parser.add_argument('--workers',type=int,choices=range(1,5),default=4)
    args=parser.parse_args();work=pathlib.Path(args.work_dir).resolve()
    if work==REPO or REPO in work.parents:parser.error('Use an external work directory; raw country data must not enter the public repository')
    work.mkdir(parents=True,exist_ok=True);index=work/'microsoft-links.csv'
    if not index.exists():
        with urllib.request.urlopen(INDEX_URL,timeout=40)as response:body=response.read(12_000_001)
        if len(body)>12_000_000 or hashlib.sha256(body).hexdigest()!=PINNED_INDEX_SHA:raise RuntimeError('Unexpected official index bytes')
        index.write_bytes(body)
    configure(work,args.grocery)
    start=time.monotonic();results=[]
    manifest={'provider':'Microsoft GlobalMLBuildingFootprints','release':'2026-08-13','indexURL':'https://bfppub.blob.core.windows.net/%24web/2026-08-13/dataset-links.csv','indexSHA256':INDEX_SHA,'pointSHA256':POINT_SHA,'inputRows':len(POINTS),'partitions':len(PARTITIONS),'workers':args.workers,'startedOn':now(),'confidenceFilter':'none; preserve known detection confidence and null for legacy unknown','license':'CDLA-Permissive-2.0','status':'running'}
    (HERE/'microsoft-progress.json').write_text(json.dumps(manifest,indent=2)+'\n')
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers,initializer=configure,initargs=(str(work),args.grocery))as pool:
        futures={pool.submit(process,item):item for item in PARTITIONS}
        for future in concurrent.futures.as_completed(futures):
            item=futures[future]
            try:result=future.result()
            except Exception as error:
                manifest.update(status='failed',error=str(error),failedPartition=item['QuadKey']);(HERE/'microsoft-progress.json').write_text(json.dumps(manifest,indent=2)+'\n');raise
            results.append(result)
            manifest.update(completed=len(results),completedCompressedBytes=sum(r['compressedBytes']for r in results),sourceFeatures=sum(r['sourceFeatures']for r in results),bboxCandidates=sum(r['bboxCandidates']for r in results),candidateBytes=sum(r['outputBytes']for r in results),elapsedSeconds=round(time.monotonic()-start,1),latestPartition=result['quadkey'])
            (HERE/'microsoft-progress.json').write_text(json.dumps(manifest,indent=2)+'\n')
            print(json.dumps({key:manifest[key]for key in['completed','partitions','completedCompressedBytes','sourceFeatures','bboxCandidates','candidateBytes','elapsedSeconds','latestPartition']}),flush=True)
    manifest.update(status='complete',completedOn=now(),receipts=sorted(results,key=lambda r:r['quadkey']))
    (HERE/'microsoft-progress.json').write_text(json.dumps(manifest,indent=2)+'\n')

if __name__=='__main__':main()
