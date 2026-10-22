#!/usr/bin/env python3
"""Apply reviewed name crosswalks and reuse exact, independently sourced venue polygons.

Inputs are explicit local snapshots. Grocery coordinates, row order, administrative
membership and existing venue array indexes are invariants. A named venue polygon
is a reference to a complex, never a point-containment or tenancy assertion.
"""
import argparse
import copy
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


def read(path):
    return json.loads(Path(path).read_text())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reconciliation', required=True)
    parser.add_argument('--reference', required=True)
    parser.add_argument('--aliases', required=True)
    parser.add_argument('--data-dir', default='data')
    args = parser.parse_args()
    folder = Path(args.data_dir)
    path = folder / 'grocery.json'
    data = read(path)
    before = copy.deepcopy(data)
    names = read(args.reconciliation)
    reference = read(args.reference)
    alias_rows = read(args.aliases)['venues']
    aliases = {v['venue_id']: v.get('venue_aliases', []) for v in alias_rows}
    for venue in data['venues']:
        values = aliases.get(venue[0], [])
        if isinstance(values, str):
            values = [v.strip() for v in values.split('|') if v.strip()]
        if len(venue) == 6:
            venue.append(values)
        else:
            venue[6] = sorted(set(venue[6] + values))
    index = {v[0]: i for i, v in enumerate(data['venues'])}
    for v in names['newVenues']:
        if v['id'] not in index:
            index[v['id']] = len(data['venues'])
            kind = v.get('venueType', 'shopping_center_candidate')
            data['venues'].append([v['id'], v['name'], kind, 'ตลาด' if kind == 'market' else 'สถานที่', '', '', v['aliases']])
    links = {v['key']: v for v in names['rows']}
    assert len(links) == len(data['rows']) == 27607
    by_source = defaultdict(set)
    assigned = Counter()
    for row in data['rows']:
        join = links[row[0]]
        venue_id = join.get('newVenueId')
        # Keep flags and all optional fields in their existing positions.
        if venue_id or len(row) > 10:
            while len(row) < 11:
                row.append(-1)
            row[10] = index[venue_id] if venue_id else -1
        if venue_id:
            assigned[venue_id] += 1
            if join.get('sourceVenueId') and join['status'] == 'name_and_source_point':
                by_source[join['sourceVenueId']].add(venue_id)
    selected = []
    venue_features = defaultdict(list)
    venue_source = {}
    for feature in reference['features']:
        props = feature['properties']
        targets = {v for source in props.get('mall_ids', []) for v in by_source.get(source, set())}
        if not targets:
            continue
        building_id = 'ref:' + str(feature['id'])
        display_height = props.get('display_height_m', 0)
        display_base = props.get('display_base_m', 0)
        assert isinstance(display_height, (int, float)) and 0 <= display_base <= display_height
        item = {
            'type': 'Feature', 'id': building_id,
            'geometry': feature['geometry'],
            'properties': {
                'buildingId': building_id,
                'originalHostId': props['host_id'],
                'height': display_height, 'base': display_base,
                'sourceHeightM': props.get('height_m'),
                'renderAs': props.get('render_as', 'extrusion'),
                'heightRole': props['height_status'],
                'heightNote': props.get('height_note', ''),
                'sourceURL': props['source_url'],
                'geometrySource': props['geometry_source'],
                'geometryRole': 'venue_reference_part' if '/part/' in building_id else 'venue_reference_footprint',
                'license': props['license'], 'sourceCheckedOn': props['retrieved_on'],
            }
        }
        if props.get('citymeter_source_url'):
            item['properties']['secondarySourceURL'] = props['citymeter_source_url']
        selected.append(item)
        for venue_id in targets:
            venue_features[venue_id].append(building_id)
            venue_source[venue_id] = next(s for s in props['mall_ids'] if venue_id in by_source.get(s, set()))
    output = {
        'meta': {
            'asOf': names['checkedOn'], 'sourceURL': 'https://montri-th.github.io/luxurybrands/data/venue-buildings.geojson',
            'sourceSHA256': hashlib.sha256(Path(args.reference).read_bytes()).hexdigest(),
            'sourceCheckedOn': names['checkedOn'], 'geometryAsOf': reference['metadata']['as_of'],
            'license': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
            'attributionURL': 'https://www.openstreetmap.org/copyright',
            'method': 'Exact accepted venue source ID crosswalk; no nearest-building replacement.',
            'limitations': [
                'Venue geometry follows a name crosswalk, independently of point-in-building results.',
                'No store coordinate is changed; neither name nor containment proves tenancy, floor or operating status.',
                'Height is source/model context. Unknown display fallback is not a measured height.',
                'Only original footprint/part geometry is reused; unrelated source outlet IDs are omitted.',
            ],
            'venueCount': len(venue_features), 'features': len(selected),
            'linkedStoreRows': sum(assigned[v] for v in venue_features),
        },
        'venues': {v: {'buildingIds': sorted(ids), 'sourceVenueId': venue_source[v], 'status': 'venue_reference',
                       'method': 'exact_venue_name_and_source_id'} for v, ids in sorted(venue_features.items())},
        'buildings': {'type': 'FeatureCollection', 'features': selected},
    }
    for old, new in zip(before['rows'], data['rows']):
        assert old[:10] == new[:10] and old[11:] == new[11:]
    assert data['venues'][:len(before['venues'])] == [v[:6] + [data['venues'][i][6]] for i, v in enumerate(before['venues'])]
    data['meta']['venueJoinAsOf'] = names['checkedOn']
    data['meta']['venueJoinRole'] = 'name_reference_not_confirmed_tenancy'
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    (folder / 'venue-reference-buildings.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(output['meta'], ensure_ascii=False))


if __name__ == '__main__':
    main()
