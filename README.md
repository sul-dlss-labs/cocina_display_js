# Cocina Display JS

Browser-ready, dependency-free JavaScript helpers for rendering Stanford Cocina metadata. The package uses standard ES modules and does not use a UI framework.

## Use

```js
import { CocinaRecord, DisplayData } from '@sul-dlss/cocina-display-js';

const response = await fetch('https://purl.stanford.edu/bb112zx3193.json');
const record = new CocinaRecord(await response.json());

console.log(record.displayTitle);
console.log(record.iiifManifestUrl());
console.log(DisplayData.toHash(record.subjectDisplayData));
```

You can also load `src/core.js` directly as a module in a browser. All data lookups are bundled as local JavaScript modules, so no network request is needed for labels or controlled vocabularies. `CocinaRecord.fetch(druid)` is async and uses the browser's `fetch` API.

The API uses JavaScript camel case: Ruby's `record.short_title` becomes `record.shortTitle`, and predicate `record.collection?` becomes `record.isCollection`. Methods that take options accept an object, for example `record.titleDisplayData({excludePrimary: true})`.

`DisplayData` exposes `label`, `objects`, and `values`. `DisplayData.toHash(...)` converts one or more display data objects to a plain object.

## Current compatibility

This is an initial browser port of the Ruby gem's record access, display data, title, contributor, subject, note, form, identifier, language, access, event, related resource, file, URL, and geospatial helpers. It includes the gem's English labels, MARC relators, language names, and license descriptions.

The Ruby gem's full Janeway JSONPath syntax, full EDTF date parsing, and all coordinate input formats have **not** been ported. `path()` supports basic child, wildcard, and recursive selectors. Date parsing handles common ISO-style dates and structured start/end ranges. For records relying on more advanced syntax or uncommon date formats, check output against the Ruby gem before replacing it in production.

## Development

```sh
npm test
```

The package has no runtime or development dependencies. The test suite uses Node's built-in test runner.
