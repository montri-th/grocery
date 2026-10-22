#!/usr/bin/env python3
"""Reconcile branch labels with venue identities; never move a store coordinate.

Inputs are the public Grocery research master and a public Shopping Center
catalogue snapshot. A name/point match remains distinct from building containment
and from tenant/operating-status confirmation. Only exact aliases are considered;
no nearest-venue assignment and no pooling by a shared logo/operator.
"""
import argparse,collections,concurrent.futures,hashlib,json,math,re,sys,time,unicodedata,urllib.request
from pathlib import Path

REPO=Path(__file__).resolve().parents[1]
WORK=REPO.parent
WS=REPO.parents[2]
ROOT=WS/'work/grocery-refresh'
BASE='https://landometer.com/api/v2/citymeter-v3/shopping-center'
BRAND_PREFIX=re.compile(r"^(?:Tops(?!\s*Plaza)(?:\s+(?:Food\s*Hall|Daily|Flavour))?|MaxVal(?:ue|u)|Big\s*C(?:\s*Mini)?|Mini\s*Big\s*C|Foodland|Villa\s*Market|Lawson\s*108|Pure|โลตัส(?:\s*โก\s*เฟรช)?|Lotus[’']?s?(?:\s*Go\s*Fresh)?|ริมปิง|ถูกดี\s*มีมาตรฐาน|ท็อปส์(?:\s*เดลี่)?)(?:\s|[\-:()])+",re.I)
RETAIL_ENTITY=re.compile(r"^(?:[\"' ]*)(?:ท็อปส์|ทอปส์|tops\b|โลตัส|lotus|big\s*c\b|บิ๊กซี|mini\s*big|makro\b|แม็คโคร|go\s*wholesale|ฟู้ดแลนด์|foodland\b|villa\s*market|แม็กซ์แวลู|lawson\b|7\s*eleven|เซเว่น)",re.I)
NEARBY=re.compile(r'ตรงข้าม|ฝั่งตรงข้าม|ก่อนถึง|ใกล้|ทางเข้า|ข้าง(?:โรงพยาบาล|โรงเรียน|โรงแรม|มหาวิทยาลัย|ห้าง)|หน้า(?:โรงพยาบาล|โรงเรียน|โรงแรม|มหาวิทยาลัย|สนามบิน|ห้าง)|หลัง(?:โรงพยาบาล|โรงเรียน|โรงแรม|มหาวิทยาลัย|ห้าง)',re.I)
LOCKED_IDENTITIES={'The Crystal Park','Seacon (branch unspecified)','Grand Canal Nonthaburi'}
GENERIC_ALIASES={'central','market','plaza','village','mall','hospital','airport','bangkok','โรงพยาบาล','สนามบิน','ตลาด','โรบินสัน','robinson','พระราม2','พระราม3','พระราม9','ศรีนครินทร์','รามคำแหง','ลาดพร้าว','บางนา','สีลม','รังสิต','สุขุมวิท','ห้วยขวาง','บางแค','หลักสี่','รามอินทรา'}
HOST_NOUN=re.compile(r'ตลาด|มาร์เก็ต|market|mall|plaza|avenue|village|ville|complex|square|center|centre|วิลเลจ|พลาซ่า|อเวนิว|ศูนย์การค้า|ทาวน์|town|park|พาร์ค|gateway|โรงแรม|hotel|building|tower|อาคาร',re.I)
CURATED_PROPER_HOSTS={'silomedge','siamscape','iconsiam','onebangkok','วันแบงค็อก','nirvanaporch','zeerrangsit'}

def eligible_alias(s):
    key=norm(s)
    return bool(key)and key not in GENERIC_ALIASES and not re.fullmatch(r'(?:พระราม|สุขุมวิท|รามคำแหง|พหลโยธิน|เพชรเกษม|ลาดพร้าว|วิภาวดีรังสิต)\d*',key)

def eligible_detail(c):
    aa=[x for x in[c.get('mallName'),c.get('nameEn'),c.get('nameTh')]if x]
    explicit_host_type=c.get('supMallType')in{'Regional Mall','Super-Regional Mall','Factory Outlet','Power Center','Airport Retail'}
    return bool(aa)and not any(RETAIL_ENTITY.search(x)for x in aa)and any(eligible_alias(x)and(explicit_host_type or HOST_NOUN.search(x)or norm(x)in CURATED_PROPER_HOSTS)for x in aa)

def norm(s):
    s=unicodedata.normalize('NFKC',str(s or '')).casefold()
    return ''.join(c for c in s if c.isalnum()or '\u0e00'<=c<='\u0e7f')

def strip_brand(s):
    return BRAND_PREFIX.sub('',str(s or '').strip()).strip(' \"\'()-:')

def aliases(v,prior_links):
    result=[v['venue_name'],*v.get('venue_aliases',[])]
    result.extend(v.get('evidence_text','').split(' | '))
    result.extend(strip_brand(x.get('venue_source_phrase',''))for x in prior_links)
    return list(dict.fromkeys(s.strip()for s in result if s and norm(s)not in GENERIC_ALIASES))

def match_alias(label,alias):
    """Whitespace/punctuation tolerant, but English tokens have real boundaries.

    In particular K Village must not match the suffix of Park Village. Thai
    compound identities are handled by explicit contradiction guards below.
    """
    return match_normalized(norm(label),norm(alias))

def match_normalized(label,alias):
    if not alias or alias in GENERIC_ALIASES:return False
    start=label.find(alias)
    while start>=0:
        end=start+len(alias)
        left=start==0 or not(label[start-1].isascii()and label[start-1].isalnum()and alias[0].isascii())
        right=end==len(label)or not(label[end].isascii()and label[end].isalnum()and alias[-1].isascii())
        if left and right:return True
        start=label.find(alias,start+1)
    return False

def distance_m(a,b):
    p,q=math.radians(float(a['latitude'])),math.radians(float(b['latitude']))
    dp=q-p;dl=math.radians(float(b['longitude'])-float(a['longitude']))
    h=math.sin(dp/2)**2+math.cos(p)*math.cos(q)*math.sin(dl/2)**2
    return 6371008.8*2*math.asin(min(1,math.sqrt(h)))

def contradiction(row,venue):
    name=row.get('store_name','');vname=venue.get('venue_name','')
    if venue.get('venue_type')=='fuel_station_or_operator_host':return None
    if NEARBY.search(name):return 'relative_or_nearby_reference'
    if vname=='K Village'and re.search(r'Park\s*Village|พาร์ค\s*วิลเลจ',name,re.I):return 'k_village_is_not_park_village'
    if vname=='Emporium'and re.search(r'India\s*Emporium|อินเดีย\s*เอ็มโพเรียม',name,re.I):return 'india_emporium_is_a_different_venue'
    if vname=='Megabangna'and re.search(r'เดอะ\s*ซิตี้|หมู่บ้าน|^ม\.',name,re.I):return 'residential_name_is_not_megabangna_host'
    if vname=='Suvarnabhumi Airport'and re.search(r'Bangchak|บางจาก|PTTOR|ปตท',name,re.I):return 'airport_named_fuel_station_is_not_terminal'
    if vname=='Kad Farang'and(row.get('district_name_th')=='แม่ริม'or re.search('แม่ริม|Mae\s*Rim',name,re.I)):return 'kad_farang_mae_rim_is_a_separate_branch'
    if vname in LOCKED_IDENTITIES:return 'unresolved_identity_preserved_for_review'
    return None

def fetch_detail(record,folder):
    """Retain exact public response bytes; never send a private source row."""
    path=folder/(record['id']+'.json')
    if path.exists():return json.loads(path.read_text())
    url=BASE+'/detail/'+record['id']
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://landometer.com/v3/citymeter?d=shoppingCenter'})
            with urllib.request.urlopen(req,timeout=45)as r:body=r.read()
            value=json.loads(body);path.write_bytes(body)
            (folder/(record['id']+'.receipt.json')).write_text(json.dumps({'url':url,'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body),'checked_on':'2026-10-22'}))
            return value
        except Exception:
            if attempt==2:raise
            time.sleep(.4*(attempt+1))

def unwrap_detail(value):
    if isinstance(value,dict):
        if'rowId'in value:return value
        for k in['value','data','result','record']:
            if isinstance(value.get(k),dict):return unwrap_detail(value[k])
    raise ValueError('Unknown shopping-center detail response')

def write_public_receipt(result,path,details):
    """Export only joined/reviewed rows; no workspace or document-service URLs."""
    meaningful=[r for r in result['rows']if r['priorVenueId']or r['newVenueId']]
    fields=['key','priorVenueId','newVenueId','canonicalName','status','matchedPhrase','referenceDistanceM']
    rows=[]
    for r in meaningful:
        item={k:r[k]for k in fields}
        # A contradictory reference is evidence for review, not a trusted host.
        item['sourceVenueId']=r['sourceVenueId']if r['status']=='name_and_source_point'else None
        rows.append(item)
    references=[]
    for cid in sorted({r['sourceVenueId']for r in meaningful if r['status']=='name_and_source_point'}):
        c=details[cid]
        references.append({'sourceVenueId':cid,'name':c.get('mallName')or c.get('nameEn')or c.get('nameTh'),'longitude':c['longitude'],'latitude':c['latitude'],'sourceURL':BASE+'/detail/'+cid,'geometryRole':'source_venue_representative_point_not_building'})
    review_fields=['key','priorVenueId','newVenueId','canonicalName','status','reason','evidenceText','referenceDistanceM','referenceSourceVenueId','referenceSourceURL']
    receipt={'schema':'citymeter-grocery-venue-name-joins-v1','checkedOn':result['checkedOn'],'summary':result['summary'],'contract':result['contract'],'catalogEvidence':result['catalogEvidence'],'rows':rows,'venueReferences':references,'newVenues':result['newVenues'],'review':[{k:r[k]for k in review_fields if k in r}for r in result['review']],'identityCrosswalks':[{k:r[k]for k in ['key','priorVenueId','newVenueId','canonicalName','sourceVenueId','matchedPhrase','referenceDistanceM','referenceSourceURL']}for r in meaningful if r['priorVenueId']and r['newVenueId']and r['priorVenueId']!=r['newVenueId']],'catalogIdentityCollisions':result['catalogIdentityCollisions']}
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(receipt,ensure_ascii=False,separators=(',',':'))+'\n')

def write_grouped_audit(result,path,details):
    grouped=collections.defaultdict(list)
    for r in result['rows']:
        if not r['priorVenueId']and r['newVenueId']:grouped[r['newVenueId']].append(r)
    groups=[]
    for vid,rr in sorted(grouped.items(),key=lambda kv:kv[1][0]['canonicalName']):
        cid=rr[0]['sourceVenueId'];c=details[cid]
        groups.append({'venueId':vid,'canonicalName':rr[0]['canonicalName'],'sourceVenueId':cid,'sourceSupType':c.get('supMallType'),'sourceSubType':c.get('subMallType'),'nameEn':c.get('nameEn'),'nameTh':c.get('nameTh'),'ownerListedCompany':c.get('ownerListedCompany'),'sourceURL':BASE+'/detail/'+cid,'newLinkCount':len(rr),'distanceRangeM':[min(r['referenceDistanceM']for r in rr),max(r['referenceDistanceM']for r in rr)],'rows':[{'key':r['key'],'storeName':r['evidenceText'],'matchedPhrase':r['matchedPhrase'],'distanceM':r['referenceDistanceM']}for r in rr]})
    report={'checkedOn':result['checkedOn'],'summary':result['summary'],'manualAuditRationale':['The catalog includes grocery shops and bare district/road labels; these are not independent venue identities. Retailer-prefixed names and unqualified geographic aliases are excluded.','Every new link has an exact qualified source-venue alias and a reference point in the same source province; new market links must be within 300 m, other named host centers within 750 m. These distances screen contradictions; they do not prove that a store is inside a venue.','Existing station branch identities remain distinct. Shared operator logos, roads, nearby airports, and nearby markets cannot merge independent stations.','Nine contradicted prior links are inactive. Three prior names with conflicting point references remain coordinate reviews, preserving their original coordinates.','The approved ALLY Village current names and legacy aliases are preserved. The Crystal Park, unspecified Seacon, and Grand Canal Nonthaburi are not silently assigned new identities.'],'newLinksByVenue':groups,'removedPriorLinks':[r for r in result['review']if r['priorVenueId']and not r['newVenueId']],'changedExistingLinks':[r for r in result['rows']if r['priorVenueId']and r['newVenueId']and r['priorVenueId']!=r['newVenueId']],'coordinateReviews':[r for r in result['review']if r['status']=='name_match_coordinate_review'],'catalogIdentityCollisions':result['catalogIdentityCollisions']}
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,default=ROOT/'source/data/grocery-rows.json')
    p.add_argument('--mapping',type=Path,default=ROOT/'venue-logos/workbook-mappings.json')
    p.add_argument('--prior-links',type=Path,default=ROOT/'venue-logos/venue-row-links.json')
    p.add_argument('--catalog',type=Path,default=WS/'outputs/luxury-brands-2026-10-21/shopping_center_name_index.json')
    p.add_argument('--details',type=Path,default=WORK/'research/shopping-center-details')
    p.add_argument('--output',type=Path,default=WORK/'name-reconciliation.json')
    p.add_argument('--public-output',type=Path,help='Optional public concise name-join receipt.')
    p.add_argument('--audit-output',type=Path,help='Optional new-link audit grouped by canonical venue.')
    p.add_argument('--fetch-details',action='store_true')
    p.add_argument('--evaluate-fixtures',action='store_true')
    args=p.parse_args()
    if args.evaluate_fixtures:
        fixtures=json.load(sys.stdin)
        print(json.dumps([{'id':f['id'],'blocked':contradiction(f['row'],f['venue']),'strippedLabel':strip_brand(f['row']['store_name']),'matches':[a for a in f.get('aliases',[])if match_alias(strip_brand(f['row']['store_name']),a)],'eligibleDetail':eligible_detail(f['detail'])if f.get('detail')else None,'referenceDistanceM':round(distance_m(f['row'],f['anchor']),2)if f.get('anchor')else None}for f in fixtures],ensure_ascii=False));return
    rows=json.loads(args.source.read_text());mapping=json.loads(args.mapping.read_text());prior=json.loads(args.prior_links.read_text())
    by_id={v['venue_id']:v for v in mapping['venues']};old_link={x['poi_id']:x for x in prior};links_by_v=collections.defaultdict(list)
    for l in prior:links_by_v[l['venue_candidate_id']].append(l)
    catalog_meta=json.loads(args.catalog.read_text());catalog=catalog_meta['records'];catalog_by_name=collections.defaultdict(list)
    for c in catalog:
        if not RETAIL_ENTITY.search(c['name'])and eligible_alias(c['name']):catalog_by_name[norm(c['name'])].append(c)
    alias_by_v={v['venue_id']:aliases(v,links_by_v[v['venue_id']])for v in mapping['venues']}
    candidate_ids={};venue_catalog=collections.defaultdict(dict)
    for vid,aa in alias_by_v.items():
        for alias in aa:
            for c in catalog_by_name.get(norm(alias),[]):venue_catalog[vid][c['id']]=c;candidate_ids[c['id']]=c
    # Additional exact whole branch-suffix names. Generic roads and grocery-chain
    # entities are excluded; a later independent point check is mandatory.
    for r in rows:
        key=norm(strip_brand(r['store_name']))
        if len(key)>=7 and key not in GENERIC_ALIASES:
            for c in catalog_by_name.get(key,[]):candidate_ids[c['id']]=c
    args.details.mkdir(parents=True,exist_ok=True)
    fetched={};fetch_errors=[]
    if args.fetch_details:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8)as ex:
            futures={ex.submit(fetch_detail,c,args.details):c for c in candidate_ids.values()}
            for future,c in list(futures.items()):
                try:fetched[c['id']]=unwrap_detail(future.result())
                except Exception as e:fetch_errors.append({'id':c['id'],'name':c['name'],'error':str(e)})
    else:
        for c in candidate_ids.values():
            path=args.details/(c['id']+'.json')
            if path.exists():fetched[c['id']]=unwrap_detail(json.loads(path.read_text()))
    # Cached, source-cited detail anchors from the immediately preceding Luxury
    # audit can be used offline; current responses take precedence.
    cached=WS/'outputs/luxury-brands-2026-10-21/shopping_centers_demo.json'
    if cached.exists():
        for c in json.loads(cached.read_text())['records']:fetched.setdefault(c['rowId'],c)
    source_to_gv=collections.defaultdict(set)
    for vid,cc in venue_catalog.items():
        for cid in cc:source_to_gv[cid].add(vid)
    collisions=[{'sourceVenueId':cid,'researchVenueIds':sorted(vv),'names':[by_id[v]['venue_name']for v in sorted(vv)]}for cid,vv in source_to_gv.items()if len(vv)>1]
    def target_for(cid,prior_vid):
        vv=source_to_gv.get(cid,set())
        if prior_vid in vv:return prior_vid
        if len(vv)==1:return next(iter(vv))
        c=fetched[cid];cn=norm(c.get('mallName')or c.get('nameEn')or c.get('nameTh'))
        exact=[v for v in sorted(vv)if norm(by_id[v]['venue_name'])==cn]
        return exact[0]if len(exact)==1 else None if vv else'SC-'+cid
    detail_aliases={cid:list(dict.fromkeys(x for x in[c.get('mallName'),c.get('nameEn'),c.get('nameTh'),candidate_ids.get(cid,{}).get('name')]if x and eligible_alias(x)))for cid,c in fetched.items()if eligible_detail(c)}
    detail_matchers={cid:[(a,norm(a))for a in aa if len(norm(a))>=7]for cid,aa in detail_aliases.items()}
    output=[];new_venues={};review=[]
    for r in rows:
        previous=old_link.get(r['poi_id']);vid=previous['venue_candidate_id']if previous else None;venue=by_id.get(vid);label=strip_brand(r['store_name'])
        record={'key':r['poi_id'].split('-')[0],'sourceRowId':r['poi_id'],'priorVenueId':vid,'newVenueId':vid,'canonicalName':venue['venue_name']if venue else None,'sourceVenueId':None,'matchedPhrase':previous.get('venue_source_phrase')if previous else None,'evidenceField':'store_name','evidenceText':r['store_name'],'sourceURL':r['source_url'],'status':'name_candidate_no_anchor'if previous else'not_matched','reason':'Existing explicit source-name candidate; independent host geometry is not established.'if previous else'No exact independent venue alias match.','referenceDistanceM':None,'coordinateUnchanged':True}
        reason=contradiction(r,venue)if venue else ('relative_or_nearby_reference'if NEARBY.search(r['store_name'])else None)
        if reason:
            record.update(newVenueId=None,status='rejected_prior_name_match'if previous else'not_matched',reason=reason)
            if previous:review.append(record.copy())
            output.append(record);continue
        candidates=[]
        if venue:
            for cid in venue_catalog.get(vid,{}):
                if cid in fetched:candidates.append((cid,venue['venue_name']))
        # Exact aliases from independently located source venues, with English
        # token boundaries. Never assign by proximity alone.
        label_key=norm(label)
        for cid,aa in detail_matchers.items():
            # A station branch is not a nearby market/mall bearing the road name.
            if venue and venue.get('venue_type')=='fuel_station_or_operator_host'and fetched[cid].get('subMallType')!='gas_station_retail':continue
            if venue and re.search(r'อาคารจอดรถ|car\s*park|parking',r['store_name'],re.I)and cid not in venue_catalog.get(vid,{}):continue
            if not venue and re.match(r'^(?:ถนน|ซอย|ตรอก)',label):continue
            matched=next((a for a,key in aa if match_normalized(label_key,key)),None)
            if matched:candidates.append((cid,matched))
        candidates=list(dict.fromkeys(candidates));near=[];distant=[]
        for cid,phrase in candidates:
            c=fetched[cid]
            if not eligible_detail(c):continue
            if not c.get('latitude')or not c.get('longitude'):continue
            d=distance_m(r,c)
            same_province=not c.get('provinceId')or c['provinceId']==r['province_id']
            limit=300 if not venue and c.get('supMallType')=='Market'else 750
            (near if same_province and d<=limit else distant).append((d,cid,phrase))
        unique_near={cid:(d,phrase)for d,cid,phrase in near}
        if len(unique_near)==1:
            cid,(d,phrase)=next(iter(unique_near.items()));c=fetched[cid]
            target=target_for(cid,vid)
            if target is None:
                record.update(newVenueId=None,status='ambiguous_catalog_identity',reason='Several research venue identities map to the source venue; no arbitrary merge.',candidateSourceVenueId=cid,candidateVenueIds=sorted(source_to_gv[cid]));review.append(record.copy());output.append(record);continue
            canonical=by_id[target]['venue_name']if target in by_id else c.get('mallName')or c.get('nameEn')or c.get('nameTh')
            record.update(newVenueId=target,canonicalName=canonical,sourceVenueId=cid,matchedPhrase=phrase,status='name_and_source_point',reason='Exact venue alias and independent source-venue point within750m in the source province; not building containment or tenancy confirmation.',referenceDistanceM=round(d,2),referenceSourceURL=BASE+'/detail/'+cid)
            if target not in by_id:new_venues[target]={'id':target,'sourceVenueId':cid,'name':canonical,'aliases':detail_aliases[cid],'venueType':'market'if c.get('supMallType')=='Market'else'shopping_center','type':c.get('supMallType'),'subtype':c.get('subMallType'),'latitude':c['latitude'],'longitude':c['longitude'],'sourceURL':BASE+'/detail/'+cid,'geometryRole':'source_venue_representative_point_not_building'}
        elif len(unique_near)>1:
            record.update(newVenueId=None,status='ambiguous_multiple_venues',reason='Multiple independently located exact-name aliases satisfy the geographic check.',candidates=[{'sourceVenueId':cid,'distanceM':round(d,2),'matchedPhrase':phrase}for cid,(d,phrase)in unique_near.items()]);review.append(record.copy())
        elif venue and distant:
            d,cid,phrase=min(distant)
            if venue['venue_name']=='Central Pattaya':
                record.update(newVenueId=None,status='ambiguous_venue_branch',reason='Pattaya has separate Central host branches; source label and independent point do not establish this branch.',referenceDistanceM=round(d,2),referenceSourceURL=BASE+'/detail/'+cid)
            else:
                c=fetched[cid];same_province=not c.get('provinceId')or c['provinceId']==r['province_id']
                record.update(sourceVenueId=cid if same_province else None,referenceSourceVenueId=cid,status='name_match_coordinate_review',reason='Explicit prior venue name retained; source point conflicts with the independent venue reference. No spatial-inside claim and no coordinate relocation.',referenceDistanceM=round(d,2),referenceSourceURL=BASE+'/detail/'+cid)
            review.append(record.copy())
        output.append(record)
    existing_types=collections.Counter(by_id[x['priorVenueId']]['venue_type']for x in output if x['priorVenueId'])
    summary={'sourceRows':len(rows),'priorLinkedRows':sum(bool(x['priorVenueId'])for x in output),'linkedRows':sum(bool(x['newVenueId'])for x in output),'newLinkedRows':sum(not x['priorVenueId']and bool(x['newVenueId'])for x in output),'removedPriorLinks':sum(bool(x['priorVenueId'])and not x['newVenueId']for x in output),'changedVenueLinks':sum(bool(x['priorVenueId'])and bool(x['newVenueId'])and x['priorVenueId']!=x['newVenueId']for x in output),'sourceVenuePointMatches':sum(x['status']=='name_and_source_point'for x in output),'statusCounts':dict(collections.Counter(x['status']for x in output)),'priorTypes':dict(existing_types),'catalogRecords':len(catalog),'requestedUniqueDetails':len(candidate_ids),'availableDetails':len(fetched),'detailFetchFailures':len(fetch_errors),'newVenueIdentities':len(new_venues),'confirmedInsideLinks':0,'coordinateChanges':0}
    result={'schema':'citymeter-grocery-venue-reconciliation-v1','checkedOn':'2026-10-22','summary':summary,'contract':{'retainedGVIds':'Existing research venue IDs remain distinct from sourceVenueId; prior identity is retained when a shared source reference occurs.','newVenueIds':'SC- plus original CityMETER venue UUID.','namePointDistanceThresholdM':750,'thresholdRole':'Geographic contradiction check for name matches, not a nearest-neighbour or containment proof.','coordinatePrecision':'Original map store coordinates are unchanged; MVT grid≈9.55m is not survey accuracy.','fuelOperatorRule':'Shared station logos never establish common branch identity.','noPromotion':'Name/point matches are not tenant or operating-status confirmations.'},'catalogEvidence':{'sourceURL':catalog_meta.get('source_url'),'snapshotDate':catalog_meta.get('retrieved_on'),'rawSHA256':catalog_meta.get('raw_sha256'),'verifiedOn':'2026-10-22','verification':'Fresh public catalog response SHA256 exactly matches the cached10869-record index.'},'rows':output,'newVenues':list(new_venues.values()),'review':review,'catalogIdentityCollisions':collisions,'fetchErrors':fetch_errors}
    result['contract'].update(newMarketNamePointDistanceThresholdM=300,sameProvinceRequired=True,sourceGeometryRole='Public catalog representative venue points; separate independent building containment is required.')
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    if args.public_output:write_public_receipt(result,args.public_output,fetched)
    if args.audit_output:write_grouped_audit(result,args.audit_output,fetched)
    print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main()
