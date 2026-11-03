import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CocinaRecord,DisplayData,Coordinates,deepCompactBlank} from '../src/core.js';
const fixture=JSON.parse(readFileSync(new URL('./fixture.json',import.meta.url)));
const record=new CocinaRecord(fixture);
test('fixture title, URLs, and identifiers',()=>{
  assert.equal(record.shortTitle,'Bugatti Type 51A. Road & Track Salon January 1957');
  assert.equal(record.contentType,'image');
  assert.equal(record.iiifManifestUrl(),'https://purl.stanford.edu/bb112zx3193/iiif3/manifest');
  assert.equal(record.searchworksId,'bb112zx3193');
});
test('fixture descriptive display data',()=>{
  assert.deepEqual(DisplayData.toHash(record.subjectDisplayData),{
    Marque:['Bugatti'],Model:['Bugatti T51A'],Subject:['Bugatti automobile']
  });
  assert.equal(record.contributorDisplayData[0].label,'Former owner');
  assert.ok(record.filesets.length>0);
});
test('JSONPath child, union, recursive, and filters',()=>{
  assert.deepEqual(record.path("$.description.contributor[?@.role[?@.value == 'photographer']].name.*.value"),['Chesebrough, Jerry']);
  assert.deepEqual(record.path("$..contributor.*.name[*]['code', 'value']"),['Hearst Magazines, Inc.','Chesebrough, Jerry','CSt']);
});
test('display data deduplicates and splits lines',()=>{
  assert.deepEqual(DisplayData.fromStrings([' First&#10;Second ','First',''], 'Label')[0].values,['First','Second']);
});
test('deep compaction preserves false and removes blank values',()=>{
  assert.deepEqual(deepCompactBlank({a:'',b:false,c:[null,{d:'x',e:[]}]}),{b:false,c:[{d:'x'}]});
});
test('coordinate point and bounding box',()=>{
  assert.equal(Coordinates.parse('41.891797, 12.486419').asWkt(),'POINT(12.486419 41.891797)');
  assert.ok(Coordinates.parse('170-- -170 / 50-- -50'));
  const box=Coordinates.fromCocina({structuredValue:[{type:'west',value:'170'},{type:'east',value:'-170'},{type:'north',value:'50'},{type:'south',value:'-50'}]});
  assert.deepEqual(box.asBbox(),[[-50,170],[50,190]]);
  assert.match(box.asWkt(),/^MULTIPOLYGON/);
});
test('encoded dates and structured ranges', async()=>{
  const {CocinaDate,DateRange}=await import('../src/core.js');
  const day=CocinaDate.fromCocina({value:'2024-08-21',encoding:{code:'w3cdtf'},type:'publication'});
  assert.equal(day.toString(),'August 21, 2024');
  assert.equal(day.sortKey,'20240821');
  const range=CocinaDate.fromCocina({type:'publication',structuredValue:[{type:'start',value:'1932',encoding:{code:'w3cdtf'}},{type:'end',value:'2012',encoding:{code:'w3cdtf'}}],qualifier:'approximate'});
  assert.ok(range instanceof DateRange);
  assert.equal(range.toString(),'[ca. 1932 - 2012]');
});
