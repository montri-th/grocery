#!/usr/bin/env python3
"""Offline source-priority merge. Never move points or infer venue tenancy.

Priority is native cached host hit, independently verified reference host hit,
then Microsoft footprint gap fill. A boundary/ambiguous result is never promoted
by a later source. Source comparisons remain audit fields, not extra hosts.
"""
import argparse
import copy
import hashlib
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HITS = {'point_inside', 'boundary_candidate', 'ambiguous'}
STATUSES = ['point_inside', 'boundary_candidate', 'ambiguous', 'no_building', 'unavailable']
LABELS = {
    'citymeter_native': ('CityMETER V4', 'https://landometer.com/v3/citymeter?d=building'),
    'verified_reference': ('OpenStreetMap / CityMETER venue reference', 'https://montri-th.github.io/luxurybrands/DATA_METHOD.md'),
    'microsoft': ('Microsoft Global ML Building Footprints', 'https://github.com/microsoft/GlobalMLBuildingFootprints'),
}

def read(path): return json.loads(Path(path).read_text())
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')

def choose(native, reference, microsoft):
    if native['status'] in HITS: return 'citymeter_native', native, 'native_host_hit'
    if reference['status'] in HITS: return 'verified_reference', reference, 'verified_reference_host_hit'
    if microsoft['status'] != 'unavailable':
        return 'microsoft', microsoft, 'native_no_polygon' if native['status'] == 'no_building' else 'native_not_queried'
    if native['status'] != 'unavailable': return 'citymeter_native', native, 'microsoft_unavailable'
    return 'microsoft', microsoft, 'no_usable_source_coverage'

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--native-dir', required=True)
    p.add_argument('--reference-dir', required=True)
    p.add_argument('--microsoft-dir', required=True)
    p.add_argument('--data-dir', default='data')
    a = p.parse_args()
    dirs = {'citymeter_native': Path(a.native_dir), 'verified_reference': Path(a.reference_dir), 'microsoft': Path(a.microsoft_dir)}
    data_dir = Path(a.data_dir)
    grocery = read(data_dir/'grocery.json')
    expected = {r[0] for r in grocery['rows']}
    combined, decision_counts, conflict_counts = Counter(dict.fromkeys(STATUSES, 0)), Counter(), Counter()
    final_keys = set()
    province_receipts = {}
    generation = datetime.now(timezone.utc).isoformat()
    for file in sorted(dirs['microsoft'].glob('*.json')):
        code = file.stem
        inputs = {source: read(folder/file.name) for source, folder in dirs.items()}
        keys = set(inputs['microsoft']['stores'])
        assert all(set(v['stores']) == keys for v in inputs.values()), code
        assert not final_keys.intersection(keys), code
        final_keys.update(keys)
        feature_maps = {}
        for source, snapshot in inputs.items():
            source_features = snapshot['buildings']['features']
            feature_maps[source] = {str(f['id']): f for f in source_features}
            assert len(feature_maps[source]) == len(source_features), (code, source, 'duplicate building IDs')
        stores, features = {}, {}
        local, local_decisions, local_conflicts = Counter(dict.fromkeys(STATUSES, 0)), Counter(), Counter()
        for key in sorted(keys):
            native, reference, microsoft = (inputs[s]['stores'][key] for s in ['citymeter_native', 'verified_reference', 'microsoft'])
            source, selected, rule = choose(native, reference, microsoft)
            item = copy.deepcopy(selected)
            conflicts = []
            if native['status'] == 'boundary_candidate' and microsoft['status'] == 'point_inside': conflicts.append('native_boundary_ms_inside')
            if native['status'] == 'no_building' and reference['status'] in HITS: conflicts.append('native_no_hit_reference_hit')
            if native['status'] == 'no_building' and microsoft['status'] in HITS: conflicts.append('native_no_hit_ms_hit')
            if reference['status'] == 'boundary_candidate' and microsoft['status'] == 'point_inside': conflicts.append('reference_boundary_ms_inside')
            item.update(decisionSource=source, decisionRule=rule,
                        nativeStatus=native['status'], nativeCoverage=native.get('queryCoverage', 'unavailable'),
                        nativeQueryContextComplete=native.get('queryContextComplete', False),
                        microsoftStatus=microsoft['status'], referenceStatus=reference['status'],
                        sourceConflict=' | '.join(conflicts))
            if native.get('queryURL'):
                item['nativeQueryURL'] = native['queryURL']
                item['nativeQuerySha256'] = native.get('querySha256')
            ids = set(item.get('candidateIds', []))
            if item.get('buildingId'): ids.add(item['buildingId'])
            assert item['status'] in {'point_inside','boundary_candidate','ambiguous','no_building','unavailable'}
            assert item['status'] != 'point_inside' or (item.get('buildingId') and item.get('boundaryDistanceM', 0) >= 10)
            for building_id in sorted(ids):
                assert building_id in feature_maps[source], (code, key, building_id, source)
                if building_id in features:
                    assert features[building_id]['geometry'] == feature_maps[source][building_id]['geometry']
                    assert features[building_id]['properties']['provider'] == source
                    continue
                feature = copy.deepcopy(feature_maps[source][building_id])
                props = feature['properties']
                props.update(provider=source, sourceLabel=LABELS[source][0], sourcePageURL=LABELS[source][1])
                height, base = props.get('height'), props.get('base', 0)
                assert isinstance(height, (int, float)) and isinstance(base, (int, float))
                assert math.isfinite(height) and math.isfinite(base) and 0 <= base <= height
                features[building_id] = feature
            stores[key] = item
            local[item['status']] += 1
            local_decisions[source] += 1
            local_conflicts.update(conflicts)
        meta = {
            'asOf': '2026-10-22', 'generatedOn': generation, 'provinceCode': code,
            'provider': 'CityMETER V4 cached responses / verified venue references / Microsoft Global ML Building Footprints',
            'guardMetres': 10, 'coverage': 'source_priority_snapshot_not_a_complete_physical_building_census',
            'inputRows': len(stores), 'inputDataSha256': sha(data_dir/'grocery.json'),
            'inputAreasSha256': sha(data_dir/'areas.json'),
            'inputSnapshotSHA256': {s: sha(folder/file.name) for s, folder in dirs.items()},
            'processingComplete': True, 'counts': dict(local), 'decisionSources': dict(local_decisions),
            'sourceComparisonCounts': dict(local_conflicts),
            'precisionNote': 'Unchanged published Grocery points;10m is a geometric review guard, not validated accuracy. A footprint match does not verify tenancy, shopfront, floor or operation.',
            'heightNote': 'Source/model context only. Missing height and display fallback remain explicitly separate; no surveyed height asserted.',
            'sourceLicenses': ['CDLA-Permissive-2.0', 'ODbL-1.0', 'CC-BY-4.0'],
            'attribution': 'Microsoft Global ML Building Footprints; CityMETER V4; © OpenStreetMap contributors;3D-GloBFP (Che et al.);Google Open Buildings',
        }
        output = {'meta': meta, 'stores': stores, 'buildings': {'type': 'FeatureCollection', 'features': [features[k] for k in sorted(features)]}}
        target = data_dir/'spatial'/file.name
        write(target, output)
        province_receipts[code] = {'url': 'data/spatial/'+file.name, 'counts': dict(local), 'decisionSources': dict(local_decisions),
                                   'stores': len(stores), 'buildings': len(features), 'bytes': target.stat().st_size, 'sha256': sha(target)}
        combined.update(local); decision_counts.update(local_decisions); conflict_counts.update(local_conflicts)
    assert final_keys == expected and len(province_receipts) == 77
    receipt = {
        'meta': {'asOf':'2026-10-22', 'generatedOn':generation, 'provider':'CityMETER V4 / verified venue references / Microsoft Global ML Building Footprints',
                 'inputRows':len(expected), 'inputDataSha256':sha(data_dir/'grocery.json'), 'inputAreasSha256':sha(data_dir/'areas.json'),
                 'processingComplete':True, 'networkRequests':0, 'guardMetres':10,
                 'coverage':'All source rows evaluated against the pinned footprint snapshots; dataset coverage is not all physical buildings.',
                 'nationwideBuildingCoverage':False,
                 'sourceLicenses':['CDLA-Permissive-2.0','ODbL-1.0','CC-BY-4.0']},
        'provinces':province_receipts, 'counts':dict(combined), 'decisionSources':dict(decision_counts), 'sourceComparisonCounts':dict(conflict_counts),
        'method': {
            'priority':['native_host_hit','verified_reference_host_hit','microsoft_gap_fill'],
            'guardMetres':10, 'coordinateChanges':0, 'nearestAssignments':0,
            'boundaryRule':'Never promote an earlier-source boundary or ambiguous result with a later-source deep interior hit.',
            'sourceComparison':'Alternative provider roofs remain audit comparisons; do not add their overlaps to chosen-source ambiguity.',
            'nameIndependence':'Geometric building matches never assign a venue name or establish tenancy.',
        },
    }
    write(data_dir/'spatial-joins.json', receipt)
    print(json.dumps({k:receipt[k] for k in ['counts','decisionSources','sourceComparisonCounts']}, ensure_ascii=False))

if __name__ == '__main__': main()
