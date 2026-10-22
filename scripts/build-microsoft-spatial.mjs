import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {referenceHit} from './build-reference-spatial-joins.mjs';
import {chooseHit,STATUSES,GUARD_METRES} from './build-spatial-joins.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {values:args}=parseArgs({options:{'work-dir':{type:'string'},grocery:{type:'string',default:join(root,'data/grocery.json')},areas:{type:'string',default:join(root,'data/areas.json')},help:{type:'boolean',short:'h'}}});
if(args.help){console.log('Usage: node scripts/build-microsoft-spatial.mjs --work-dir <external cache directory> [--grocery <json>] [--areas <json>]\nReads completed fetch-microsoft-buildings.py receipts and exports provider-only PIP snapshots outside the repository.');process.exit(0);}
if(!args['work-dir'])throw Error('--work-dir is required');
const here=resolve(args['work-dir']),within=relative(root,here);
if(!within||(!within.startsWith('..')&&!isAbsolute(within)))throw Error('Work directory must be outside the public repository');
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=async path=>JSON.parse(await readFile(join(here,path),'utf8'));
const [progress,groceryBytes,areasBytes]=await Promise.all([read('microsoft-progress.json'),readFile(args.grocery),readFile(args.areas)]);
const grocery=JSON.parse(groceryBytes),areas=JSON.parse(areasBytes);
if(progress.status!=='complete'||progress.completed!==142||progress.receipts.length!==142)throw Error('All official country partitions must complete before PIP export');
const pointSHA=hash(JSON.stringify(grocery.rows.map(r=>[r[0],r[5],r[6]])));
if(pointSHA!==progress.pointSHA256)throw Error('Input point coordinates changed during source extraction');
const rows=new Map(grocery.rows.map(r=>[r[0],r]));
const hits=new Map(grocery.rows.map(r=>[r[0],new Map()]));
const buildings=new Map();let bboxCandidates=0;
const knownFiles=new Set(progress.receipts.map(r=>r.quadkey+'.geojsonl'));
const files=(await readdir(join(here,'microsoft-candidates'))).filter(f=>knownFiles.has(f)).sort();
if(files.length!==142)throw Error('Candidate file coverage incomplete');
for(const name of files){
  const receipt=progress.receipts.find(r=>r.quadkey===name.split('.')[0]);
  const bytes=await readFile(join(here,'microsoft-candidates',name));
  if(hash(bytes)!==receipt.outputSHA256)throw Error('Candidate snapshot checksum mismatch: '+name);
  const lines=createInterface({input:createReadStream(join(here,'microsoft-candidates',name)),crlfDelay:Infinity});
  for await(const line of lines){
    if(!line)continue;const f=JSON.parse(line);bboxCandidates++;
    if(f.id!==f.properties.buildingId||!f.properties.sourceFileSHA256)throw Error('Invalid source provenance');
    for(const key of f.properties.candidateStoreKeys){
      const row=rows.get(key);if(!row)throw Error('Unknown source point key');
      const hit=referenceHit(row[5],row[6],f.geometry);if(!hit)continue;
      if(!buildings.has(f.id)){
        const {candidateStoreKeys,...properties}=f.properties;
        buildings.set(f.id,{...f,properties:{...properties,sourceObservations:[]}});
      }
      const building=buildings.get(f.id);
      if(building.properties.sourceGeometrySHA256!==f.properties.sourceGeometrySHA256)throw Error('Geometry ID collision');
      const observation={sourcePartition:f.properties.sourcePartition,sourceURL:f.properties.sourceURL,sourceFileSHA256:f.properties.sourceFileSHA256,sourceLineSHA256:f.properties.sourceLineSHA256,rawHeight:f.properties.rawHeight,rawConfidence:f.properties.rawConfidence};
      if(!building.properties.sourceObservations.some(v=>v.sourceLineSHA256===observation.sourceLineSHA256&&v.sourcePartition===observation.sourcePartition))building.properties.sourceObservations.push(observation);
      hits.get(key).set(f.id,{buildingId:f.id,...hit});
    }
  }
}
const pCode=areas.provinces.fields.indexOf('code'),dProvince=areas.districts.fields.indexOf('p');
const emptyCounts=()=>Object.fromEntries(STATUSES.map(s=>[s,0]));
const provinces=new Map(areas.provinces.rows.map(r=>[r[pCode],{stores:{},buildings:new Map(),counts:emptyCounts()}]));
const counts=emptyCounts();
for(const row of grocery.rows){
  const province=provinces.get(areas.provinces.rows[areas.districts.rows[row[7]][dProvince]][pCode]);
  const candidates=[...hits.get(row[0]).values()];const result=chooseHit(candidates);
  for(const hit of candidates)province.buildings.set(hit.buildingId,buildings.get(hit.buildingId));
  const selected=result.buildingId?buildings.get(result.buildingId):null;
  province.stores[row[0]]={...result,sourceURL:selected?.properties.sourceURL||progress.indexURL,queryCoverage:'complete_thailand_release',provider:'microsoft_ml'};
  province.counts[result.status]++;counts[result.status]++;
}
const meta={asOf:'2026-10-22',generatedOn:new Date().toISOString(),provider:'Microsoft GlobalMLBuildingFootprints',sourceRelease:'2026-08-13',sourceURL:progress.indexURL,indexSHA256:progress.indexSHA256,inputRows:grocery.rows.length,inputPointSHA256:pointSHA,inputDataSHA256:hash(groceryBytes),license:'CDLA-Permissive-2.0',licenseURL:'https://cdla.dev/permissive-2-0/',attribution:'Microsoft GlobalMLBuildingFootprints',sourceCheckedOn:'2026-10-22',partitionCount:142,sourceFeatures:progress.sourceFeatures,sourceCompressedBytes:progress.completedCompressedBytes,sourcePartitionReceipts:'microsoft-receipts/<quadkey>.download.json',processingComplete:true,coverage:'all_official_thailand_country_release_partitions',guardMetres:GUARD_METRES,confidenceFilter:'none; unknown legacy values preserved separately',heightNote:'Positive source height is a model estimate. Missing/-1/nonpositive/invalid source height is unknown; any 3m extrusion is display-only.',precisionNote:'The plotted store coordinates are unchanged published CityMETER points at5decimal degrees from an approximately9.55m source MVT grid. The10m geometric guard is not validated positional accuracy. ML roofprints are imagery detections, not surveyed walls, tenancy or current operating evidence.'};
const method={join:'unchanged source point tested against unmodified Microsoft ML Polygon/MultiPolygon footprints including holes',point_inside:'exactly one containing raw footprint has boundary clearance>=10m',boundary_candidate:'containing footprints exist but no candidate clears the10m guard',ambiguous:'more than one containing raw footprint clears the10m guard',no_building:'no containing footprint in the fully processed Microsoft Thailand release; does not establish no physical building exists',unavailable:'not emitted after complete country source processing',identity:'msml-20260813 plus first20hex of full canonical source geometry SHA256; exact duplicate geometry coalesced with every source observation preserved',confidence:'no confidence threshold applied; valid0..1 is footprint detection confidence only; missing/-1 is unknown',tenancy:'neither geometry containment nor ML confidence confirms a store, venue, floor or tenant',heights:meta.heightNote};
await mkdir(join(here,'microsoft-spatial'),{recursive:true});const provinceIndex={};
for(const[code,p]of provinces){
  const features=[...p.buildings.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const payload={meta:{...meta,provinceCode:code,inputRows:Object.keys(p.stores).length,counts:p.counts,buildingCount:features.length},stores:Object.fromEntries(Object.entries(p.stores).sort(([a],[b])=>a.localeCompare(b))),buildings:{type:'FeatureCollection',features}};
  const text=JSON.stringify(payload)+'\n',url='microsoft-spatial/'+code+'.json';await writeFile(join(here,url),text);
  provinceIndex[code]={url,counts:p.counts,stores:Object.keys(p.stores).length,buildings:features.length,bytes:Buffer.byteLength(text),sha256:hash(text)};
}
const manifest={meta,counts,method,provinces:provinceIndex};await writeFile(join(here,'microsoft-spatial-joins.json'),JSON.stringify(manifest)+'\n');
console.log(JSON.stringify({bboxCandidates,distinctContainingFootprints:buildings.size,counts,provinces:provinces.size,bytes:Object.values(provinceIndex).reduce((n,p)=>n+p.bytes,0)}));
