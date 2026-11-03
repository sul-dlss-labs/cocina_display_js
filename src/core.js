import data from './data.js';
import marcCountries from './marc-countries.js';

export const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
export const blank = value => value == null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && !value.length) || (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length);
export const unique = values => [...new Set(values)];
export const compact = values => values.filter(value => !blank(value));
export const dig = (value, ...keys) => keys.reduce((node, key) => node?.[key], value);
export function flattenNestedValues(cocina, atomicTypes = []) {
  if (Array.isArray(cocina)) return cocina.flatMap(node => flattenNestedValues(node, atomicTypes));
  if (!cocina || typeof cocina !== 'object') return [];
  if (!blank(cocina.value) || atomicTypes.includes(cocina.type)) return [cocina];
  return [...array(cocina.structuredValue), ...array(cocina.groupedValue)].flatMap(node => flattenNestedValues(node, atomicTypes));
}
export function deepCompactBlank(node, preserveKeys = []) {
  if (Array.isArray(node)) return compact(node.map(value => deepCompactBlank(value, preserveKeys)));
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).flatMap(([key,value]) => {
    const result = deepCompactBlank(value, preserveKeys);
    return blank(result) && !preserveKeys.includes(key) ? [] : [[key,result]];
  }));
}
export function compactAndJoin(values, delimiter = ' ') {
  const parts = compact(values).map(value => String(value).trim());
  if (!parts.length) return '';
  return parts.reduce((result, value) => !result ? value : result.endsWith(delimiter.trim()) || value.startsWith(delimiter.trim()) ? `${result} ${value}` : `${result}${delimiter}${value}`, '');
}
export function label(scope, type, fallback) {
  const key = type?.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
  return dig(data.labels, 'field_label', scope, key) ?? fallback;
}
export const ucfirst = value => value ? value[0].toUpperCase() + value.slice(1) : value;
export const Utils = { flattenNestedValues, deepCompactBlank, compactAndJoin };

export class DisplayData {
  constructor({label, objects}) { this.label = label; this.objects = objects; }
  get values() { return unique(this.objects.flatMap(obj => String(obj?.toString?.() ?? obj ?? '').replaceAll('&#10;', '\n').split('\n').map(v => v.trim())).filter(v => !blank(v))); }
  toHash() { return {[this.label ?? '']: this.values}; }
  static fromObjects(objects) {
    const groups = new Map();
    for (const obj of objects) { const label = obj.label; if (!groups.has(label)) groups.set(label, []); groups.get(label).push(obj); }
    return [...groups].map(([label, objects]) => new DisplayData({label, objects})).filter(data => data.values.length);
  }
  static fromStrings(values, label = null) { return this.fromObjects(values.map(value => ({label, toString: () => value}))); }
  static fromCocina(cocina, label = null) { return this.fromObjects(array(cocina).map(node => ({label: node.displayLabel ?? label, toString: () => node.value}))); }
  static toHash(values) { return Object.assign({}, ...array(values).map(value => value.toHash())); }
}

const PARALLEL_TYPES = ['parallel','translated','translation','transliterated','transliteration','display'];
export class ParallelValue {
  constructor(cocina, parent) { this.cocina = cocina ?? {}; this.parent = parent; this.role = PARALLEL_TYPES.includes(this.cocina.type) ? this.cocina.type : null; }
  get siblings() { return this.parent.parallelValues.filter(value => value !== this); }
  get ownType() { return this.role ? null : this.cocina.type; }
  get type() { return this.ownType ?? this.parent.mainValue?.ownType ?? this.parent.ownType; }
  get status() { return this.cocina.status; }
  get language() { return this.cocina.valueLanguage ? new Language(this.cocina.valueLanguage) : null; }
  get displayLabel() { return this.cocina.displayLabel; }
  get isDisplay() { return this.role === 'display'; }
  get isPrimary() { return this.status === 'primary'; }
  get isVernacular() { return !!this.language && !this.language.isEnglish; }
  get isTranslated() { return ['translated','translation'].includes(this.role) || (this.siblings.some(value => value.isVernacular) && !!this.language?.isEnglish); }
  get isTransliterated() { return ['transliterated','transliteration'].includes(this.role) || !!this.language?.isTransliterated; }
}
export class Parallel {
  constructor(cocina) { this.cocina = cocina ?? {}; }
  get ownType() { return this.cocina.type; }
  get type() { return this.ownType ?? this.mainValue?.ownType; }
  get isTyped() { return !blank(this.type); }
  get parallelValues() { return this._parallelValues ??= (array(this.cocina.parallelValue).length ? this.cocina.parallelValue : [this.cocina]).map(value => new this.valueClass(value, this)); }
  get valueClass() { return ParallelValue; }
  get mainValue() { return this.parallelValues.find(v => v.isDisplay) ?? this.parallelValues.find(v => v.isPrimary) ?? this.parallelValues.find(v => v.isVernacular) ?? this.parallelValues.find(v => v.ownType) ?? this.parallelValues[0]; }
  get translatedValue() { return this.parallelValues.find(v => v.isTranslated); }
  get transliteratedValue() { return this.parallelValues.find(v => v.isTransliterated); }
  get vernacularValue() { return this.parallelValues.find(v => v.isVernacular); }
  get hasTranslation() { return !!this.translatedValue; }
  get hasTransliteration() { return !!this.transliteratedValue; }
  get hasVernacular() { return !!this.vernacularValue; }
  get isPrimary() { return this.cocina.status === 'primary'; }
  get displayLabel() { return this.cocina.displayLabel; }
}
export class Script { constructor(cocina) { this.cocina = cocina ?? {}; } get code() { return this.cocina.code; } get isLatin() { return this.code === 'Latn'; } }
export class Language {
  constructor(cocina) { this.cocina = cocina ?? {}; }
  get code() { return this.cocina.code; }
  get decodedValue() { return data.languages[this.code]; }
  toString() { return this.cocina.value ?? this.decodedValue ?? ''; }
  get isEnglish() { return this.toString() === 'English'; }
  get script() { const value = this.cocina.valueScript ?? this.cocina.script; return value ? new Script(value) : null; }
  get isTransliterated() { return !this.isEnglish && !!this.script?.isLatin; }
  get ietfTag() { return this.isTransliterated ? `${this.code}-${this.script.code}` : this.code; }
  get isSearchworksLanguage() { return Object.values(data.languages).includes(this.cocina.value) || Object.hasOwn(data.languages, this.code); }
  get label() { return this.cocina.displayLabel ?? data.labels.field_label.language; }
}
export class Identifier {
  constructor(cocina) { this.cocina = cocina ?? {}; }
  get value() { return this.cocina.uri ?? this.cocina.value; }
  get code() { return this.cocina.source?.code; }
  get isDoi() { return /doi/i.test(this.cocina.type ?? '') || this.code === 'doi' || this.cocina.uri?.includes('://doi.org') || false; }
  get type() { return this.isDoi ? 'DOI' : this.cocina.uri?.includes('orcid.org') ? 'ORCID' : this.cocina.type; }
  get identifier() { try { return new URL(this.value).pathname.replace(/^\//, '') || null; } catch { return this.value && !/\s/.test(this.value) ? this.value.replace(/^\//, '') : null; } }
  get schemeUri() { return this.cocina.source?.uri ?? {ORCID:'https://orcid.org/',ROR:'https://ror.org/',DOI:'https://doi.org/',ISNI:'https://isni.org/'}[this.type]; }
  get uri() { return this.cocina.uri ?? (this.schemeUri && this.identifier ? `${this.schemeUri.replace(/\/$/, '')}/${this.identifier}` : null); }
  get label() { return this.cocina.displayLabel ?? label('identifier',this.type,ucfirst(this.type) ?? data.labels.field_label.identifier.identifier); }
  toString() { return this.uri ?? this.value ?? ''; }
}
export class Role {
  constructor(cocina) { this.cocina = cocina ?? {}; }
  get code() { return this.cocina.code; }
  get isMarcRelator() { return this.cocina.source?.code === 'marcrelator'; }
  toString() { return this.cocina.value ?? (this.isMarcRelator ? data.marcRelators[this.code] : null) ?? ''; }
  get isAuthor() { return /^(author|creator|primary investigator)/i.test(this.toString()); }
  get isPublisher() { return /^publisher/i.test(this.toString()); }
  get isFunder() { return /^funder/i.test(this.toString()); }
}
export class NameValue extends ParallelValue {
  get nameValues() { return Object.groupBy(flattenNestedValues(this.cocina), node => node.type ?? 'name'); }
  get surnameStr() { return compactAndJoin(array(this.nameValues.surname).map(v => v.value)); }
  get forenameStr() { return compactAndJoin([...array(this.nameValues.forename),...array(this.nameValues.ordinal)].map(v => v.value)); }
  get datesStr() { return compactAndJoin([...array(this.nameValues['life dates']),...array(this.nameValues['activity dates'])].map(v => v.value), ', '); }
  get fullNameStr() { const names = compact([this.surnameStr,this.forenameStr]); return compactAndJoin([...((names.length && names) || array(this.nameValues.name).map(v => v.value)), compactAndJoin(array(this.nameValues['term of address']).map(v => v.value),', ')], ', '); }
  toString({withDate = false} = {}) { return this.cocina.value ?? (withDate && this.datesStr ? compactAndJoin([this.fullNameStr,this.datesStr],', ') : this.fullNameStr); }
}
export class Name extends Parallel { get valueClass() { return NameValue; } toString(options) { return this.mainValue?.toString(options) ?? ''; } get forenameStr() { return this.mainValue?.forenameStr; } get surnameStr() { return this.mainValue?.surnameStr; } }
export class Affiliation {
  constructor(cocina) { this.cocina = cocina ?? {}; }
  get nameComponents() { return compact(flattenNestedValues(this.cocina).map(v => v.value)); }
  get displayName() { return this.nameComponents.join(', '); }
  get identifiers() { return flattenNestedValues(this.cocina).flatMap(v => array(v.identifier)).map(v => new Identifier(v)); }
  get rorIdentifier() { return this.identifiers.find(v => v.type === 'ROR'); }
  get ror() { return this.rorIdentifier?.uri; }
  get rorId() { return this.rorIdentifier?.identifier; }
  toString() { return this.displayName; }
}
export class Contributor {
  constructor(cocina) { this.cocina = cocina ?? {}; }
  get type() { return this.cocina.type; }
  get isPerson() { return this.type === 'person'; }
  get isOrganization() { return this.type === 'organization'; }
  get isConference() { return this.type === 'conference'; }
  get isPrimary() { return this.cocina.status === 'primary'; }
  get roles() { return this._roles ??= array(this.cocina.role).map(v => new Role(v)); }
  get hasRole() { return !!this.roles.length; }
  get isAuthor() { return this.roles.some(v => v.isAuthor); }
  get isPublisher() { return this.roles.some(v => v.isPublisher); }
  get isFunder() { return this.roles.some(v => v.isFunder); }
  get names() { return this._names ??= array(this.cocina.name).map(v => new Name(v)); }
  displayNames(options = {}) { return compact(this.names.map(v => v.toString(options))); }
  displayName(options = {}) { return this.displayNames(options)[0]; }
  get label() { return this.cocina.displayLabel ?? this.roles[0]?.toString() ?? data.labels.contributor.role.default; }
  get forename() { return this.names[0]?.forenameStr; }
  get surname() { return this.names[0]?.surnameStr; }
  get affiliations() { return array(this.cocina.affiliation).map(v => new Affiliation(v)); }
  get identifiers() { return array(this.cocina.identifier).map(v => new Identifier(v)); }
  get orcidIdentifier() { return this.identifiers.find(v => v.type === 'ORCID'); }
  get orcid() { return this.orcidIdentifier?.uri; }
  get orcidId() { return this.orcidIdentifier?.identifier; }
  toString() { return this.displayName({withDate: true}) ?? ''; }
}
export class TitleValue extends ParallelValue {
  get parts() { return Object.groupBy(flattenNestedValues(this.cocina), node => ['main title','nonsorting characters','part name','part number','subtitle'].includes(node.type) ? node.type : 'main title'); }
  part(type) { return compactAndJoin(array(this.parts[type]).map(v => v.value)); }
  get nonsortingCharsStr() {
    const value = this.part('nonsorting characters').trim();
    if (!value) return '';
    if (/[-']$/.test(value) || value === 'ה') return value;
    const count = array(this.cocina.note).find(v => v.type === 'nonsorting character count')?.value;
    return count == null ? `${value} ` : value.padEnd(Number(count), ' ');
  }
  get shortTitle() { return (this.nonsortingCharsStr + this.part('main title')) || this.cocina.value; }
  get partsStr() { return compactAndJoin([...(this.parts['part number'] ? array(this.parts['part number']).map(v=>v.value) : array(this.parent.partNumbers)),...array(this.parts['part name']).map(v=>v.value),this.parent.partLabel], ', '); }
  get namesStr() { return compactAndJoin(array(this.cocina.note).filter(v => v.type === 'associated name').map(v => new Name(v).toString({withDate:true})), '. '); }
  get fullTitle() {
    const base = compactAndJoin([this.part('main title'),this.part('subtitle')], ' : ');
    const title = `${this.nonsortingCharsStr}${this.partsStr && !base.endsWith(this.partsStr) ? compactAndJoin([base,this.partsStr],'. ') : base}`;
    const named = this.namesStr ? compactAndJoin([this.namesStr,title],'. ') : title;
    return named ? named + (/[\p{P}]$/u.test(named) ? '' : '.') : this.cocina.value;
  }
  get displayTitle() { return this.fullTitle?.replace(/[.,;:\\/]+$/, '') ?? this.cocina.value; }
  get sortTitle() { return this.fullTitle ? this.fullTitle.slice(this.nonsortingCharsStr.length).normalize('NFD').replace(/[\p{P}]/gu,'').replace(/\W{2,}/g,' ').trim() : '\u{10FFFF}'; }
  get label() { return this.displayLabel ?? label('title',this.type,data.labels.field_label.title.title); }
  toString() { return this.displayTitle ?? ''; }
}
export class Title extends Parallel {
  constructor(cocina, {partLabel = null,partNumbers = []} = {}) { super(cocina); this.partLabel = partLabel; this.partNumbers = partNumbers; }
  get valueClass() { return TitleValue; }
  get shortTitle() { return this.mainValue?.shortTitle; }
  get fullTitle() { return this.mainValue?.fullTitle; }
  get displayTitle() { return this.mainValue?.displayTitle; }
  get sortTitle() { return this.mainValue?.sortTitle; }
  get label() { return this.displayLabel ?? label('title',this.type,data.labels.field_label.title.title); }
  toString() { return this.displayTitle ?? ''; }
}
export class NoteValue extends ParallelValue {
  get isAbstract() { return /Abstract|Summary|Scope and content/i.test(this.displayLabel ?? '') || ['summary','abstract','scope and content'].includes(this.type); }
  get isPreferredCitation() { return /Preferred citation/i.test(this.displayLabel ?? '') || this.type === 'preferred citation'; }
  get isTableOfContents() { return /Table of contents/i.test(this.displayLabel ?? '') || this.type === 'table of contents'; }
  get isPart() { return this.type === 'part'; }
  get isGeneralNote() { return !this.isAbstract && !this.isPreferredCitation && !this.isTableOfContents && !this.isPart; }
  get delimiter() { return this.isTableOfContents ? ' -- ' : null; }
  clean(value) { return this.delimiter ? String(value ?? '').replace(/^\s*--\s*|\s*--\s*$/g,'').trim() : String(value ?? '').trim(); }
  get values() { return compact(flattenNestedValues(this.cocina).flatMap(v => this.delimiter ? this.clean(v.value).split('--').map(x => x.trim()) : [this.clean(v.value)])); }
  get valuesByType() { const result = {}; for (const node of flattenNestedValues(this.cocina)) (result[node.type ?? ''] ??= []).push(...(this.delimiter ? this.clean(node.value).split('--').map(x => x.trim()) : [this.clean(node.value)])); return result; }
  get label() { return this.displayLabel ?? label('note',this.type,ucfirst(this.type) ?? data.labels.field_label.note.note); }
  toString() { return compactAndJoin(this.values,this.delimiter ?? ''); }
}
export class Note extends Parallel {
  get valueClass() { return NoteValue; }
  get isAbstract() { return this.mainValue?.isAbstract; }
  get isPreferredCitation() { return this.mainValue?.isPreferredCitation; }
  get isTableOfContents() { return this.mainValue?.isTableOfContents; }
  get isPart() { return this.mainValue?.isPart; }
  get isGeneralNote() { return this.mainValue?.isGeneralNote; }
  get values() { return this.mainValue?.values ?? []; }
  get valuesByType() { return this.mainValue?.valuesByType ?? {}; }
  get label() { return this.displayLabel ?? label('note',this.type,ucfirst(this.type) ?? data.labels.field_label.note.note); }
  toString() { return this.mainValue?.toString() ?? ''; }
}
export class Form {
  constructor(cocina) { this.cocina = cocina ?? {}; }
  static fromCocina(cocina) { return cocina.type === 'genre' ? new Genre(cocina) : cocina.type === 'resource type' ? new ResourceType(cocina) : new Form(cocina); }
  get type() { return this.cocina.type; }
  get values() { return compact(flattenNestedValues(this.cocina).map(v => v.value)); }
  get flatValue() { return compactAndJoin(this.values,' > '); }
  get label() { return this.cocina.displayLabel ?? label('form',this.type,data.labels.field_label.form.form); }
  toString() { return this.flatValue; }
}
export class Genre extends Form { toString() { return ucfirst(super.toString()); } }
export class ResourceType extends Form {
  get isStanfordSelfDeposit() { return this.cocina.source?.value === 'Stanford self-deposit resource types'; }
  get isMods() { return this.cocina.source?.value === 'MODS resource types'; }
  get flatValue() { if (!this.isStanfordSelfDeposit || !this.cocina.structuredValue) return super.flatValue; const nodes = flattenNestedValues(this.cocina); const primary = nodes.find(v => v.type === 'type')?.value; const subtypes = nodes.filter(v => v.type === 'subtype').map(v => v.value); return subtypes.length ? `${primary} (${subtypes.join(', ')})` : primary; }
  get label() { return this.cocina.displayLabel ?? (this.isStanfordSelfDeposit ? data.labels.field_label.form.genre : super.label); }
  toString() { return this.isStanfordSelfDeposit ? this.flatValue : this.flatValue?.toLowerCase(); }
}
const NAME_TYPES = ['person','family','organization','conference','event','name'];
const PLACE_TYPES = ['area','city','city section','continent','country','county','coverage','extraterrestrial area','island','place','region','state','territory'];
const COORD_TYPES = ['point coordinates','map coordinates','bounding box coordinates'];
const ATOMIC_TYPES = [...NAME_TYPES,'title','time',...COORD_TYPES];
export class SubjectPart {
  constructor(cocina,type) { this.cocina = cocina ?? {}; this.type = this.cocina.type ?? type; }
  static fromCocina(cocina,type) { const values = typeof cocina.value === 'string' && cocina.value.includes('--') && !type?.includes('coordinates') ? cocina.value.split('--').map(v => ({...cocina,value:v.trim()})) : [cocina]; return values.map(value => new (NAME_TYPES.includes(type) ? NameSubjectPart : type === 'title' ? TitleSubjectPart : type === 'time' ? TemporalSubjectPart : PLACE_TYPES.includes(type) ? PlaceSubjectPart : COORD_TYPES.includes(type) ? CoordinatesSubjectPart : SubjectPart)(value,type)); }
  toString() { return this.cocina.value ?? ''; }
}
export class NameSubjectPart extends SubjectPart { get name() { return new Name(this.cocina); } toString() { return this.name.toString({withDate:true}); } }
export class TitleSubjectPart extends SubjectPart { get title() { return new Title(this.cocina); } toString() { return this.title.toString(); } }
export class TemporalSubjectPart extends SubjectPart { toString() { return this.cocina.value ?? ''; } }
export class PlaceSubjectPart extends SubjectPart { get uri() { return this.cocina.uri; } get isGeonames() { return this.uri?.includes('sws.geonames.org') ?? false; } get geonamesId() { return this.isGeonames ? this.uri?.split('/').filter(Boolean).at(-1) : null; } }
export class CoordinatesSubjectPart extends SubjectPart {}
export class SubjectValue extends ParallelValue {
  get subjectParts() { const nodes = ATOMIC_TYPES.includes(this.type) ? [this.cocina] : flattenNestedValues(this.cocina,ATOMIC_TYPES); return nodes.flatMap(v => SubjectPart.fromCocina(v,v.type ?? this.type)); }
  get values() { return compact(this.subjectParts.map(v => v.toString())); }
  get delimiter() { return ' > '; }
  get flatValue() { return compactAndJoin(this.values,this.delimiter); }
  toString() { return this.type === 'genre' ? ucfirst(this.flatValue) : this.flatValue; }
  get label() { return this.displayLabel ?? label('subject',this.type,data.labels.field_label.subject.subject); }
}
export class Subject extends Parallel {
  get valueClass() { return SubjectValue; }
  get label() { return this.displayLabel ?? label('subject',this.type,data.labels.field_label.subject.subject); }
  get subjectParts() { return this.mainValue?.subjectParts ?? []; }
  get values() { return this.mainValue?.values ?? []; }
  toString() { return this.mainValue?.toString() ?? ''; }
}
export class File {
  constructor(cocina,{druid,baseUrl='https://stacks.stanford.edu'} = {}) { this.cocina = cocina ?? {}; this.druid = druid; this.baseUrl = baseUrl; }
  get filename() { return this.cocina.filename; }
  get mimeType() { return this.cocina.hasMimeType; }
  get use() { return this.cocina.use; }
  get size() { return this.cocina.size; }
  get height() { return Number(this.cocina.presentation?.height ?? 0); }
  get width() { return Number(this.cocina.presentation?.width ?? 0); }
  get hasNonzeroDimensions() { return this.height > 0 && this.width > 0; }
  get isThumbnail() { return this.use === 'thumbnail' && this.hasNonzeroDimensions; }
  get isJp2Image() { return this.mimeType === 'image/jp2' && this.hasNonzeroDimensions; }
  get iiifId() { return this.isJp2Image ? encodeURIComponent(`${this.druid}/${this.filename.replace(/\.jp2$/,'')}`) : null; }
  iiifUrl({region='full',width='!400',height='400'} = {}) { return this.iiifId ? `${this.baseUrl}/image/iiif/${this.iiifId}/${region}/${width},${height}/0/default.jpg` : null; }
  get downloadUrl() { return `${this.baseUrl}/file/druid:${this.druid}/${encodeURIComponent(this.filename)}`; }
}
export class FileSet {
  constructor(cocina,{druid,baseUrl='https://stacks.stanford.edu'} = {}) { this.cocina = cocina ?? {}; this.druid = druid ?? this.cocina.externalIdentifier?.match(/[a-z]{2}\d{3}[a-z]{2}\d{4}/)?.[0]; this.baseUrl = baseUrl; }
  get type() { return this.cocina.type?.replace(/^https:\/\/cocina\.sul\.stanford\.edu\/models\/resources\//,''); }
  get files() { return this._files ??= array(this.cocina.structural?.contains).map(v => new File(v,{druid:this.druid,baseUrl:this.baseUrl})); }
}
export class Access {
  constructor(cocina) { this.cocina = cocina ?? {}; }
  get type() { return this.cocina.type; }
  get label() { return this.cocina.displayLabel ?? label('access',this.type,data.labels.field_label.access.access); }
  get isContactEmail() { return false; }
  toString() { return this.cocina.value ?? ''; }
}
export class AccessContact extends Access { get isContactEmail() { return this.type === 'email'; } }
export class AccessUrl extends Access { get label() { return data.labels.field_label.access.url; } get linkText() { return this.cocina.displayLabel; } }
export class EventNote {
  constructor(cocina) { this.cocina = cocina ?? {}; }
  get type() { return this.cocina.type; }
  get label() { return this.cocina.displayLabel ?? data.labels.field_label.event.note[this.type?.replace(/\s+/g,'_')] ?? data.labels.field_label.event.note.default; }
  toString() { return ['issuance','frequency'].includes(this.type) ? this.cocina.value?.toLowerCase() ?? '' : this.cocina.value ?? ''; }
}
export class LocationValue extends ParallelValue { get countryName() { return this.cocina.source?.code === 'marccountry' && !['xx','vp'].includes(this.cocina.code) ? marcCountries[this.cocina.code] : null; } get isUnencodedValue() { return !blank(this.cocina.value); } toString() { return this.cocina.value ?? this.countryName ?? ''; } }
export class Location extends Parallel { get valueClass() { return LocationValue; } get countryName() { return this.mainValue?.countryName; } toString() { return this.mainValue?.toString() ?? ''; } }
export class Event {
  constructor(cocina) { this.cocina = cocina ?? {}; }
  get type() { return this.cocina.type; }
  get dates() { return this._dates ??= array(this.cocina.date).map(v => CocinaDate.fromCocina(v,this.type)).filter(v => v?.isParsable); }
  get dateTypes() { return unique(this.dates.map(v => v.type)); }
  get types() { return compact([this.type,...this.dateTypes]); }
  hasType(type) { return this.types.includes(type); }
  hasAnyType(...types) { return types.some(type => this.hasType(type)); }
  get contributors() { return array(this.cocina.contributor).map(v => new Contributor(v)); }
  get locations() { return array(this.cocina.location).map(v => new Location(v)); }
  get notes() { return array(this.cocina.note).map(v => new EventNote(v)); }
  get isImprint() { return this.contributors.length > 0 && this.locations.length > 0 && (this.hasType('publication') || !this.types.length) && (!this.dates.length || this.dates.some(v => !v.isEncoded)); }
  get displayDates() { const seen = new Map(); for (const date of this.dates) { const prev = seen.get(date.baseValue); if (!prev || (!prev.isEncoded && date.isEncoded)) seen.set(date.baseValue,date); } return [...seen.values()].sort((a,b) => a.sortKey.localeCompare(b.sortKey)); }
  get dateStr() { const dates = unique(compact(this.displayDates.map(v => v.toString()))); return dates.length > 2 ? `${dates.slice(0,-1).join(', ')}, and ${dates.at(-1)}` : dates.join(' and '); }
  get placeStr() { return unique(compact(this.locations.flatMap(v => v.parallelValues.map(x => x.toString())))).join(', '); }
  get label() { return this.cocina.displayLabel ?? (this.toString() === this.dateStr ? this.dates[0]?.label : null) ?? ucfirst(this.type ?? this.dateTypes[0] ?? 'Event'); }
  toString() { return compactAndJoin([this.placeStr,this.dateStr],', '); }
}
export class Imprint extends Event {
  get label() { return this.cocina.displayLabel ?? 'Imprint'; }
  get displayDates() { const seen = new Map(); for (const date of this.dates) { const prev = seen.get(date.baseValue); if (!prev || (prev.isEncoded && !date.isEncoded)) seen.set(date.baseValue,date); } return [...seen.values()].sort((a,b) => a.sortKey.localeCompare(b.sortKey)); }
  get dateStr() { return compactAndJoin(this.displayDates.map(v => v.toString()),'; '); }
  get placeStr() { const all = this.locations.flatMap(v => v.parallelValues); const unencoded = all.filter(v => v.isUnencodedValue); return compactAndJoin(unique(compact((unencoded.length ? unencoded : all).map(v => v.toString()))),' : '); }
  toString() { const placeContrib = compactAndJoin([this.placeStr,compactAndJoin(this.contributors.map(v => v.displayName()),' : ')],' : '); const edition = compactAndJoin(this.notes.filter(v => v.type === 'edition').map(v => v.toString()),', '); const copyright = compactAndJoin(this.notes.filter(v => v.type === 'copyright statement').map(v => v.toString()),', '); return compactAndJoin([compactAndJoin([edition,placeContrib],' - '),this.dateStr,copyright],', '); }
}
export class CocinaDate {
  constructor(cocina,type = null) { this.cocina = cocina ?? {}; this.type = this.cocina.type ?? type; }
  static fromCocina(cocina,type=null) { return array(cocina?.structuredValue).length ? new DateRange(cocina,type) : new CocinaDate(cocina,type); }
  get value() { return this.cocina.value ?? ''; }
  get baseValue() { return this.value; }
  get isEncoded() { return !!this.cocina.encoding?.code; }
  get isPrimary() { return this.cocina.status === 'primary'; }
  get isQualified() { return !!this.cocina.qualifier; }
  get isApproximate() { return /approximate/i.test(this.cocina.qualifier ?? ''); }
  get isParsable() { return !!this.value && !['0000-00-00','9999','uuuu','[uuuu]'].includes(this.value); }
  get isParsedDate() { return /^-?\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(this.value); }
  get year() { return this.isParsedDate ? Number(this.value.match(/^-?\d{4}/)[0]) : null; }
  get precision() { return /^-?\d{4}-\d{2}-\d{2}$/.test(this.value) ? 'day' : /^-?\d{4}-\d{2}$/.test(this.value) ? 'month' : this.isParsedDate ? 'year' : 'unknown'; }
  get sortKey() { return this.isParsedDate ? this.value.replace(/\D/g,'').padEnd(8,'0') : ''; }
  decodedValue(allowedPrecisions=['day','month','year','decade','century','unknown']) { if (!this.isParsedDate) return this.value.trim(); const precision=allowedPrecisions.includes(this.precision) ? this.precision : allowedPrecisions[0]; const year=this.year; const yearStr=year<1?`${Math.abs(year)+1} BCE`:year<1000?`${year} CE`:`${year}`; if (precision==='year') return yearStr; const month=Number(this.value.match(/^-?\d{4}-(\d{2})/)?.[1]); if (precision==='month') return month ? `${new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2000,month-1,1)))} ${yearStr}` : yearStr; const day=Number(this.value.match(/^-?\d{4}-\d{2}-(\d{2})/)?.[1]); if (precision==='day' && month && day) return `${new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2000,month-1,1)))} ${day}, ${yearStr}`; return yearStr; }
  get qualifiedValue() { const value=this.decodedValue(); return this.cocina.qualifier==='approximate' ? `[ca. ${value}]` : this.cocina.qualifier==='questionable' ? `[${value}?]` : this.cocina.qualifier==='inferred' ? `[${value}]` : value; }
  get label() { return this.cocina.displayLabel ?? (this.type ? `${ucfirst(this.type)} date` : 'Date'); }
  toString() { return !this.isEncoded && !/^(?:-?\d+|[\dXxu?-]{4})$/.test(this.value) ? this.value.trim() : this.qualifiedValue; }
}
export class DateRange extends CocinaDate {
  constructor(cocina,type=null) { super(cocina,type); const values=array(cocina.structuredValue); this.start=values.find(v=>v.type==='start') ? CocinaDate.fromCocina({...values.find(v=>v.type==='start'),encoding:values.find(v=>v.type==='start').encoding ?? cocina.encoding},type) : null; this.stop=values.find(v=>v.type==='end') ? CocinaDate.fromCocina({...values.find(v=>v.type==='end'),encoding:values.find(v=>v.type==='end').encoding ?? cocina.encoding},type) : null; }
  get value() { return unique(compact([this.start?.value,this.stop?.value])).join(' - '); }
  get baseValue() { return `${this.start?.baseValue ?? ''}-${this.stop?.baseValue ?? ''}`; }
  get isEncoded() { return !!(this.start?.isEncoded || this.stop?.isEncoded || super.isEncoded); }
  get isPrimary() { return !!(this.start?.isPrimary || this.stop?.isPrimary || super.isPrimary); }
  get isApproximate() { return !!(this.start?.isApproximate || this.stop?.isApproximate || super.isApproximate); }
  get isParsable() { return !!(this.start?.isParsable || this.stop?.isParsable); }
  get isParsedDate() { return !!(this.start?.isParsedDate || this.stop?.isParsedDate); }
  get year() { return this.start?.year ?? this.stop?.year; }
  get sortKey() { return `${this.start?.sortKey ?? ''}${this.stop?.sortKey ?? ''}`; }
  decodedValue(allowedPrecisions) { return unique(compact([this.start?.decodedValue(allowedPrecisions),this.stop?.decodedValue(allowedPrecisions)])).join(' - '); }
  get qualifiedValue() { const value=this.decodedValue(); return this.cocina.qualifier==='approximate' ? `[ca. ${value}]` : this.cocina.qualifier==='questionable' ? `[${value}?]` : this.cocina.qualifier==='inferred' ? `[${value}]` : unique(compact([this.start?.qualifiedValue,this.stop?.qualifiedValue])).join(' - '); }
  toString() { return this.qualifiedValue; }
}
// JSONPath selectors used by Cocina consumers. Unsupported expressions fail explicitly.
export function jsonPath(document, expression) {
  if (!expression.startsWith('$')) throw new SyntaxError('JSONPath must start with $');
  const tokens=[];
  let index=1;
  while (index<expression.length) {
    if (expression.startsWith('..',index)) {
      index+=2;
      if (expression[index]==='[') {
        const end=expression.indexOf(']',index);
        if(end<0) throw new SyntaxError('Unclosed JSONPath bracket');
        const selector=expression.slice(index+1,end);
        if(!/^(?:['"][^'"]+['"])(?:\s*,\s*['"][^'"]+['"])*$/.test(selector)) throw new SyntaxError(`Unsupported recursive selector: ${selector}`);
        tokens.push({kind:'recursive',key:selector.split(/\s*,\s*/).map(v=>v.slice(1,-1))}); index=end+1;
      } else {
        const match=expression.slice(index).match(/^[\w]+|^\*/);
        if (!match) throw new SyntaxError(`Unsupported JSONPath at ${index}`);
        tokens.push({kind:'recursive',key:match[0]}); index+=match[0].length;
      }
    } else if (expression[index]==='.') {
      index++;
      const match=expression.slice(index).match(/^[\w]+|^\*/);
      if (!match) throw new SyntaxError(`Unsupported JSONPath at ${index}`);
      tokens.push({kind:'child',key:match[0]}); index+=match[0].length;
    } else if (expression[index]==='[') {
      let depth=1, quote=null, end=index+1;
      for (;end<expression.length && depth;end++) {
        const char=expression[end];
        if (quote) { if (char===quote && expression[end-1]!==String.fromCharCode(92)) quote=null; }
        else if (char==="'" || char==='"') quote=char;
        else if (char==='[') depth++;
        else if (char===']') depth--;
      }
      if (depth) throw new SyntaxError('Unclosed JSONPath bracket');
      const selector=expression.slice(index+1,end-1).trim();
      if (selector==='*') tokens.push({kind:'child',key:'*'});
      else if (/^\d+$/.test(selector)) tokens.push({kind:'child',key:Number(selector)});
      else if (selector.startsWith('?')) tokens.push({kind:'filter',predicate:selector.slice(1).trim().replace(/^\(|\)$/g,'')});
      else if (/^(?:['"][^'"]+['"])(?:\s*,\s*['"][^'"]+['"])*$/.test(selector)) tokens.push({kind:'union',keys:selector.split(/\s*,\s*/).map(v=>v.slice(1,-1))});
      else throw new SyntaxError(`Unsupported JSONPath selector: ${selector}`);
      index=end;
    } else throw new SyntaxError(`Unsupported JSONPath at ${index}`);
  }
  let nodes=[document];
  const descend=(node,key,out)=>{
    if (Array.isArray(node)) for(const value of node) descend(value,key,out);
    else if(node && typeof node==='object') for(const [name,value] of Object.entries(node)) { if(key==='*'||name===key||Array.isArray(key)&&key.includes(name)) out.push(value); descend(value,key,out); }
  };
  for(const token of tokens) {
    const output=[];
    for(const node of nodes) {
      if(token.kind==='recursive') descend(node,token.key,output);
      else if(token.kind==='filter') { for(const candidate of array(node)) if(jsonPathPredicate(candidate,token.predicate)) output.push(candidate); }
      else if(token.kind==='union') { for(const key of token.keys) if(node?.[key]!==undefined) output.push(node[key]); }
      else if(token.key==='*') output.push(...(Array.isArray(node)?node:Object.values(node??{})));
      else if(node?.[token.key]!==undefined) output.push(node[token.key]);
    }
    nodes=output;
  }
  return nodes;
}
function jsonPathPredicate(node,predicate) {
  const equality=predicate.match(/^@((?:\.[\w]+|\[['"][^'"]+['"]\])+?)\s*(==|!=)\s*(['"])(.*?)\3$/);
  if(equality) {
    const path=jsonPath(node,'$'+equality[1]);
    return path.some(value=>equality[2]==='=='?value===equality[4]:value!==equality[4]);
  }
  const nested=predicate.match(/^@((?:\.[\w]+|\[['"][^'"]+['"]\])+?)\[\?(.+)\]$/);
  if(nested) return jsonPath(node,'$'+nested[1]).some(value=>array(value).some(child=>jsonPathPredicate(child,nested[2].trim().replace(/^\(|\)$/g,''))));
  const exists=predicate.match(/^@((?:\.[\w]+|\[['"][^'"]+['"]\])+)$/);
  if(exists) return jsonPath(node,'$'+exists[1]).length>0;
  throw new SyntaxError(`Unsupported JSONPath filter: ${predicate}`);
}
export class JsonBackedRecord {
  constructor(cocinaDoc) { this.cocinaDoc = cocinaDoc ?? {}; }
  get text() { const values = []; function visit(node,source = false) { if (Array.isArray(node)) node.forEach(v => visit(v,source)); else if (node && typeof node === 'object') for (const [key,value] of Object.entries(node)) { if (source || key === 'source') continue; if ((key === 'code' || key === 'value') && typeof value === 'string') values.push(value); else visit(value); } } visit(this.cocinaDoc); return values.join(' ').replace(/\s+/g,' ').trim(); }
  path(expression) { return jsonPath(this.cocinaDoc,expression); }
  get description() { return this.cocinaDoc.description ?? {}; }
  get druid() { return this.cocinaDoc.externalIdentifier; }
  get bareDruid() { return this.druid?.replace(/^druid:/,''); }
  get purlUrl() { return this.description.purl; }
  get purlBaseUrl() { try { return new URL(this.purlUrl).origin; } catch { return null; } }
  get stacksBaseUrl() { return this.purlBaseUrl === 'https://sul-purl-stage.stanford.edu' ? 'https://sul-stacks-stage.stanford.edu' : this.purlBaseUrl ? 'https://stacks.stanford.edu' : null; }
  get searchworksBaseUrl() { return this.purlBaseUrl === 'https://sul-purl-stage.stanford.edu' ? 'https://searchworks-stage.stanford.edu' : this.purlBaseUrl ? 'https://searchworks.stanford.edu' : null; }
  get contentType() { return this.cocinaDoc.type?.replace(/^https:\/\/cocina\.sul\.stanford\.edu\/models\//,''); }
  get isCollection() { return this.contentType === 'collection'; }
  oembedUrl(params = {}) { if ((!(this instanceof RelatedResource) && this.isCollection) || !this.purlUrl) return null; const query = new URLSearchParams({...params,url:params.url ?? this.purlUrl}); return `${this.purlBaseUrl}/embed.json?${query}`; }
  get downloadUrl() { return this instanceof CocinaRecord && this.bareDruid && !this.isCollection ? `${this.stacksBaseUrl}/object/${this.bareDruid}` : null; }
  iiifManifestUrl(version = 3) { return this.purlUrl ? `${this.purlUrl}/${version === 3 ? 'iiif3' : 'iiif'}/manifest` : null; }
  get searchworksUrl() { return this.searchworksId ? `${this.searchworksBaseUrl}/view/${this.searchworksId}` : null; }
  get allTitles() { return this._allTitles ??= array(this.description.title).map(v => new Title(v,{partLabel:array(this.cocinaDoc.identification?.catalogLinks).find(x=>x.catalog==='folio')?.partLabel,partNumbers:this.notes.filter(x=>x.isPart).flatMap(x=>x.valuesByType.number ?? [])})); }
  get primaryTitle() { return this.allTitles.find(v => v.isPrimary) ?? this.allTitles.find(v => !v.isTyped); }
  get secondaryTitles() { return this.allTitles.filter(v => v !== this.primaryTitle); }
  get shortTitle() { return this.primaryTitle?.shortTitle; }
  get fullTitle() { return this.primaryTitle?.fullTitle; }
  get displayTitle() { return this.primaryTitle?.displayTitle; }
  get label() { return this.displayTitle; }
  get sortTitle() { return this.primaryTitle?.sortTitle ?? '\u{10FFFF}'; }
  get additionalTitles() { return compact([...(this.primaryTitle?.mainValue?.siblings ?? []),...this.secondaryTitles.flatMap(v=>v.parallelValues)].map(v=>v.displayTitle)); }
  titleDisplayData({excludePrimary=false} = {}) { return DisplayData.fromObjects((excludePrimary ? this.secondaryTitles : this.allTitles).flatMap(v=>v.parallelValues)); }
  get notes() { return this._notes ??= array(this.description.note).map(v=>new Note(v)); }
  get abstracts() { return compact(this.notes.filter(v=>v.isAbstract).map(v=>v.toString())); }
  get tablesOfContents() { return compact(this.notes.filter(v=>v.isTableOfContents).map(v=>v.toString())); }
  get preferredCitation() { return this.notes.find(v=>v.isPreferredCitation)?.toString(); }
  get abstractDisplayData() { return DisplayData.fromObjects(this.notes.filter(v=>v.isAbstract)); }
  get generalNoteDisplayData() { return DisplayData.fromObjects(this.notes.filter(v=>v.isGeneralNote)); }
  get preferredCitationDisplayData() { return DisplayData.fromObjects(this.notes.filter(v=>v.isPreferredCitation)); }
  get tableOfContentsDisplayData() { return DisplayData.fromObjects(this.notes.filter(v=>v.isTableOfContents)); }
  get contributors() { return this._contributors ??= [...array(this.description.contributor),...array(this.description.event).flatMap(v=>array(v.contributor))].map(v=>new Contributor(v)); }
  get authorContributors() { return this.contributors.filter(v=>v.isAuthor); }
  get publisherContributors() { return this.contributors.filter(v=>v.isPublisher); }
  get mainContributor() { return this.contributors.find(v=>v.isPrimary) ?? this.contributors.find(v=>!v.hasRole) ?? this.contributors[0]; }
  get additionalContributors() { return this.contributors.filter(v=>v!==this.mainContributor && !this.imprintEvents.some(e=>e.contributors.some(c=>JSON.stringify(c.cocina)===JSON.stringify(v.cocina)))); }
  mainContributorName(options = {}) { return this.mainContributor?.displayName(options); }
  additionalContributorNames(options = {}) { return compact(this.additionalContributors.flatMap(v=>v.displayNames(options))); }
  get publisherNames() { return compact(this.publisherContributors.flatMap(v=>v.displayNames())); }
  get authorNames() { return compact(this.authorContributors.flatMap(v=>v.displayNames())); }
  personContributorNames(options = {}) { return compact(this.contributors.filter(v=>v.isPerson).flatMap(v=>v.displayNames(options))); }
  get impersonalContributorNames() { return compact(this.contributors.filter(v=>!v.isPerson).flatMap(v=>v.displayNames())); }
  get organizationContributorNames() { return compact(this.contributors.filter(v=>v.isOrganization).flatMap(v=>v.displayNames())); }
  get conferenceContributorNames() { return compact(this.contributors.filter(v=>v.isConference).flatMap(v=>v.displayNames())); }
  get contributorsByRole() { const result = new Map(); for (const contributor of this.contributors) for (const role of contributor.roles.length ? contributor.roles : [null]) { const key = role?.toString() ?? null; if (!result.has(key)) result.set(key,[]); result.get(key).push(contributor); } return result; }
  contributorNamesByRole(options = {}) { return Object.fromEntries([...this.contributorsByRole].map(([key,contributors])=>[key??'null',compact(contributors.flatMap(v=>v.displayNames(options)))])); }
  get contributorDisplayData() { return [...this.contributorsByRole].map(([role,contributors])=>new DisplayData({label: data.labels.contributor.role[role] ?? ucfirst(role) ?? data.labels.contributor.role.default,objects:contributors})); }
  get sortContributorName() { return `${this.mainContributor?.displayName() ?? '\u{10FFFF}'} ${this.sortTitle}`.replace(/[\p{P}]/gu,'').trim(); }
  get allSubjects() { return this._allSubjects ??= [...array(this.description.subject),...array(this.description.geographic).flatMap(v=>array(v.subject))].map(v=>new Subject(v)); }
  get genreSubjects() { return this.allSubjects.filter(v=>v.type==='genre'); }
  get classificationSubjects() { return this.allSubjects.filter(v=>v.type==='classification'); }
  get coordinateSubjects() { return this.allSubjects.filter(v=>v.type?.includes('coordinates')); }
  get subjectParts() { return this.allSubjects.flatMap(v=>v.parallelValues).flatMap(v=>v.subjectParts); }
  get placeSubjectParts() { return this.subjectParts.filter(v=>v instanceof PlaceSubjectPart); }
  get coordinateSubjectParts() { return this.subjectParts.filter(v=>v instanceof CoordinatesSubjectPart); }
  subjectPartValues(type) { return unique(this.subjectParts.filter(v=>v.type===type).map(v=>v.toString())); }
  get subjectTopics() { return this.subjectPartValues('topic'); }
  get subjectGenres() { return this.subjectPartValues('genre'); }
  get subjectTitles() { return this.subjectPartValues('title'); }
  get subjectTemporal() { return this.subjectPartValues('time'); }
  get subjectOccupations() { return this.subjectPartValues('occupation'); }
  get subjectPlaces() { return unique(this.placeSubjectParts.map(v=>v.toString())); }
  get subjectNames() { return unique(this.subjectParts.filter(v=>v instanceof NameSubjectPart).map(v=>v.toString())); }
  get subjectOther() { return [...this.subjectOccupations,...this.subjectNames,...this.subjectTitles]; }
  get subjectTopicsOther() { return [...this.subjectTopics,...this.subjectOther]; }
  get subjectTemporalGenre() { return [...this.subjectTemporal,...this.subjectGenres]; }
  get subjectAll() { return [...this.subjectTopicsOther,...this.subjectTemporalGenre,...this.subjectPlaces]; }
  get subjectAllDisplay() { return unique(this.allSubjects.map(v=>v.toString())); }
  get subjectDisplayData() { return DisplayData.fromObjects(this.allSubjects.filter(v=>!['genre','classification'].includes(v.type) && !v.type?.includes('coordinates'))); }
  get geonamesIds() { return unique(compact(this.placeSubjectParts.map(v=>v.geonamesId))); }
  get languages() { return this._languages ??= array(this.description.language).map(v=>new Language(v)); }
  get searchworksLanguageNames() { return unique(compact(this.languages.filter(v=>v.isSearchworksLanguage).map(v=>v.toString()))); }
  get languageDisplayData() { return DisplayData.fromObjects(this.languages); }
  get allForms() { return this._allForms ??= [...array(this.description.form),...array(this.description.geographic).flatMap(v=>array(v.form))].flatMap(v=>flattenNestedValues(v,['resource type'])).map(v=>Form.fromCocina(v)); }
  get formForms() { return this.allForms.filter(v=>v.type==='form'); }
  get genreForms() { return this.allForms.filter(v=>v.type==='genre'); }
  get extentForms() { return this.allForms.filter(v=>v.type==='extent'); }
  get mapForms() { return this.allForms.filter(v=>['map scale','map projection'].includes(v.type)); }
  get mediaForms() { return this.allForms.filter(v=>['reformatting quality','media type'].includes(v.type)); }
  get allResourceTypes() { return this.allForms.filter(v=>v instanceof ResourceType); }
  get selfDepositResourceTypes() { return this.allResourceTypes.filter(v=>v.isStanfordSelfDeposit); }
  get resourceTypeValues() { return unique(this.allResourceTypes.map(v=>v.toString())); }
  get modsResourceTypes() { return this.allResourceTypes.filter(v=>v.isMods).map(v=>v.toString()); }
  get forms() { return unique(compact(this.formForms.map(v=>v.toString()))); }
  get extents() { return unique(compact(this.extentForms.map(v=>v.toString()))); }
  get genres() { return unique(compact(this.genreForms.map(v=>v.toString()))); }
  get genresSearch() { return unique([...this.genres,...(this.genres.includes('Thesis')?['Thesis/Dissertation']:[]),...(this.genres.includes('Conference publication')?['Conference proceedings']:[]),...(this.genres.includes('Government publication')?['Government document']:[])]); }
  get formDisplayData() { return DisplayData.fromObjects(this.allForms.filter(v=>!this.genreForms.includes(v)&&!this.mapForms.includes(v)&&!this.mediaForms.includes(v)&&!this.selfDepositResourceTypes.includes(v))); }
  get genreDisplayData() { return DisplayData.fromObjects([...this.genreForms,...this.genreSubjects,...this.selfDepositResourceTypes]); }
  get mapDisplayData() { return DisplayData.fromObjects([...this.mapForms,...this.coordinateSubjects]); }
  get formNoteDisplayData() { return DisplayData.fromCocina([...array(this.description.form).flatMap(v=>array(v.note)),...array(this.description.geographic).flatMap(v=>array(v.form).flatMap(x=>array(x.note)))],data.labels.field_label.form.note); }
  get issuanceTerms() { return unique(this.events.flatMap(v=>v.notes).filter(v=>v.type==='issuance').map(v=>v.toString())); }
  get frequency() { return unique(this.events.flatMap(v=>v.notes).filter(v=>v.type==='frequency').map(v=>v.toString())); }
  get isPeriodical() { return this.issuanceTerms.some(v=>['periodical','serial'].includes(v)) || !!this.frequency.length; }
  get isCartographic() { return this.resourceTypeValues.includes('cartographic'); }
  get isArchivedWebsite() { return this.genres.includes('Archived website'); }
  get isDataset() { return this.genres.includes('Dataset'); }
  get searchworksResourceTypes() { const mapped = this.resourceTypeValues.flatMap(v=>({dataset:['Dataset'],cartographic:['Map'],manuscript:['Archive/Manuscript'],'mixed material':['Archive/Manuscript'],'moving image':['Video/Film'],'notated music':['Music score'],'sound recording':['Sound recording'],'sound recording-musical':['Sound recording'],'sound recording-nonmusical':['Sound recording'],audio:['Sound recording'],'still image':['Image'],'three dimensional object':['Object'],artifact:['Object'],tactile:['Object']})[v] ?? (['software, multimedia','multimedia'].includes(v) && !this.isCartographic && !this.isDataset ? ['Software/Multimedia'] : v==='text' ? this.isPeriodical || this.isArchivedWebsite ? [...(this.isPeriodical?['Journal/Periodical']:[]),...(this.isArchivedWebsite?['Website','Website|Archived website']:[])] : ['Book'] : [])); return unique([...mapped,...(this.isDataset?['Dataset']:[]),...(this.resourceTypeValues.length && this.resourceTypeValues.every(v=>v==='digital')?['Software/Multimedia']:[])]); }
  get allIdentifiers() { return this._allIdentifiers ??= [...array(this.description.identifier),...(this.cocinaDoc.identification?.doi ? [{[this.cocinaDoc.identification.doi.startsWith('http')?'uri':'value']:this.cocinaDoc.identification.doi,type:'doi'}] : [])].map(v=>new Identifier(v)); }
  identifiers(type = null) { return type ? this.allIdentifiers.filter(v=>v.type?.toLowerCase()===type.toLowerCase()) : this.allIdentifiers; }
  get identifierDisplayData() { return DisplayData.fromObjects(this.allIdentifiers); }
  get doi() { return this.allIdentifiers.find(v=>v.isDoi)?.identifier; }
  get doiUrl() { return this.doi ? `https://doi.org/${this.doi}` : null; }
  folioHrid(refresh = null) { const link = array(this.cocinaDoc.identification?.catalogLinks).find(v=>v.catalog==='folio'); return link?.catalogRecordId && (refresh === null || link.refresh===refresh) ? link.catalogRecordId : null; }
  get catkey() { return this.folioHrid(); }
  get searchworksId() { return this.folioHrid() ?? this.bareDruid; }
  get relatedResources() { return this._relatedResources ??= array(this.description.relatedResource).map(v=>new RelatedResource(v)); }
  get relatedResourceDisplayData() { return DisplayData.fromObjects(this.relatedResources); }
  get events() { return this._events ??= array(this.description.event).map(v=>{const e=new Event(v); return e.isImprint ? new Imprint(v) : e;}); }
  get adminCreationEvent() { const value = array(this.description.adminMetadata?.event).find(v=>v.type==='creation'); return value ? new Event(value) : null; }
  get publicationEvents() { return this.events.filter(v=>v.hasAnyType('publication','creation','capture')); }
  get imprintEvents() { return this.events.filter(v=>v instanceof Imprint); }
  get eventDates() { return this.events.flatMap(v=>v.dates); }
  get eventDisplayData() { return DisplayData.fromObjects(this.events); }
  get eventNoteDisplayData() { return DisplayData.fromObjects(this.events.flatMap(v=>v.notes)); }
  pubDate({ignoreQualified=false} = {}) { for (const type of ['publication','creation','capture']) { let dates = this.eventDates.filter(v=>v.type===type && v.isParsedDate && (!ignoreQualified || !v.isApproximate)); if (!dates.length) continue; const primary=dates.filter(v=>v.isPrimary); if(primary.length) dates=primary; const encoded=dates.filter(v=>v.isEncoded); if(encoded.length) dates=encoded; return dates.sort((a,b)=>a.sortKey.localeCompare(b.sortKey))[0]; } return null; }
  pubYearInt(options = {}) { return this.pubDate(options)?.year; }
  pubYearInts(options = {}) { const date=this.pubDate(options); return date ? unique(compact([date.start?.year,date.stop?.year,date.year])).sort((a,b)=>a-b) : null; }
  pubYearStr(options = {}) { const date=this.pubDate(options); return date?.decodedValue(['year','decade','century']); }
  pubDateSortStr(options = {}) { return this.pubDate(options)?.sortKey; }
  get pubDateStr() { return this.pubDate()?.toString(); }
  get imprintStr() { return compact(this.imprintEvents.map(v=>v.toString())).join('; '); }
  get publicationPlaces() { return unique(compact(this.publicationEvents.flatMap(v=>v.locations.map(x=>x.toString())))); }
  get publicationCountries() { return unique(compact(this.publicationEvents.flatMap(v=>v.locations.map(x=>x.countryName)))); }
  get accesses() { const a=this.description.access; return [...array(a?.physicalLocation),...array(a?.digitalLocation),...array(a?.digitalRepository)].map(v=>new Access(v)); }
  get accessContacts() { return array(this.description.access?.accessContact).map(v=>new AccessContact(v)); }
  get urls() { return array(this.description.access?.url).map(v=>new AccessUrl(v)); }
  get accessDisplayData() { return DisplayData.fromObjects([...this.accesses,...this.accessContacts.filter(v=>!v.isContactEmail),...(this.purlUrl?[{label:data.labels.field_label.purl,toString:()=>this.purlUrl}]:[]),...this.urls]); }
  get contactEmailDisplayData() { return DisplayData.fromObjects(this.accessContacts.filter(v=>v.isContactEmail)); }
  get viewRights() { return this.cocinaDoc.access?.view; }
  get downloadRights() { return this.cocinaDoc.access?.download; }
  get locationRights() { return this.cocinaDoc.access?.location; }
  get isViewable() { return this.viewRights !== 'dark'; }
  get isDownloadable() { return !!this.downloadRights && this.downloadRights !== 'none'; }
  get isWorldViewable() { return this.viewRights === 'world'; }
  get isWorldDownloadable() { return this.downloadRights === 'world'; }
  get isWorldAccess() { return this.isWorldViewable && (this.isCollection || this.isWorldDownloadable); }
  get isStanfordOnlyViewable() { return this.viewRights === 'stanford'; }
  get isStanfordOnlyDownloadable() { return this.downloadRights === 'stanford'; }
  get isStanfordOnlyAccess() { return this.isStanfordOnlyViewable && this.isStanfordOnlyDownloadable; }
  get isStanfordViewable() { return this.isWorldViewable || this.isStanfordOnlyViewable; }
  get isStanfordDownloadable() { return this.isWorldDownloadable || this.isStanfordOnlyDownloadable; }
  get isStanfordAccess() { return this.isStanfordViewable && (this.isCollection || this.isStanfordDownloadable); }
  get isDarkAccess() { return !this.isViewable && !this.isDownloadable; }
  get isLocationOnlyViewable() { return this.viewRights === 'location-based'; }
  get isLocationOnlyDownloadable() { return this.downloadRights === 'location-based'; }
  get isLocationOnlyAccess() { return this.isLocationOnlyViewable && this.isLocationOnlyDownloadable; }
  viewableAtLocation(location) { return this.isStanfordViewable || this.locationRights===location; }
  get isCitationOnlyAccess() { return this.viewRights === 'citation-only'; }
  get useAndReproduction() { return this.cocinaDoc.access?.useAndReproductionStatement; }
  get copyright() { return this.cocinaDoc.access?.copyright; }
  get license() { return this.cocinaDoc.access?.license; }
  get licenseDescription() { return data.licenses[this.license]?.description; }
  get useAndReproductionDisplayData() { return DisplayData.fromStrings([this.useAndReproduction],data.labels.field_label.use_and_reproduction); }
  get copyrightDisplayData() { return DisplayData.fromStrings([this.copyright],data.labels.field_label.copyright); }
  get licenseDisplayData() { return DisplayData.fromStrings([this.licenseDescription],data.labels.field_label.license); }
  get filesets() { return this._filesets ??= array(this.cocinaDoc.structural?.contains).map(v=>new FileSet(v,{druid:this.bareDruid,baseUrl:this.stacksBaseUrl ?? undefined})); }
  files({filename=null,mimeType=null,use=null} = {}) { return this.filesets.flatMap(v=>v.files).filter(v=>(!filename || filename.test(v.filename)) && (!mimeType || mimeType.test(v.mimeType)) && (!use || use===v.use)); }
  get fileMimeTypes() { return unique(compact(this.files().map(v=>v.mimeType))); }
  get filesetTypes() { return unique(compact(this.filesets.map(v=>v.type))); }
  get totalFileSizeInt() { return this.files().reduce((sum,file)=>sum+(file.size??0),0); }
  get totalFileSizeStr() { const size=this.totalFileSizeInt; if(size<1024) return `${size} Bytes`; const units=['KB','MB','GB','TB']; let n=size,i=-1; do { n/=1024; i++; } while(n>=1024 && i<units.length-1); return `${Number(n.toPrecision(3))} ${units[i]}`; }
  get thumbnailFile() { return this.files().find(v=>v.isThumbnail) ?? this.files().find(v=>v.isJp2Image); }
  get hasThumbnail() { return !!this.thumbnailFile; }
  thumbnailUrl(options = {}) { return this.thumbnailFile?.iiifUrl(options); }
  get containingCollections() { return array(this.cocinaDoc.structural?.isMemberOf).map(v=>v.replace(/^druid:/,'')); }
  get memberEnumeration() { return array(this.cocinaDoc.structural?.hasMemberOrders).flatMap(v=>array(v.members)); }
  get isVirtualObject() { return !this.filesets.length && !!this.memberEnumeration.length; }
  get virtualObjectMembers() { return this.isVirtualObject ? this.memberEnumeration.map(v=>v.replace(/^druid:/,'')) : []; }
  get virtualObjectParents() { return compact(this.relatedResources.filter(v=>v.type==='part of').map(v=>v.purlUrl?.split('/').at(-1))); }
}
export class CocinaRecord extends JsonBackedRecord {
  static fromJson(json,{deepCompact=false} = {}) { const data=JSON.parse(json); return new CocinaRecord(deepCompact ? deepCompactBlank(data) : data); }
  static async fetch(druid,{deepCompact=true,purlUrl='https://purl.stanford.edu',fetch:fetcher=globalThis.fetch} = {}) { const response=await fetcher(`${purlUrl}/${druid}.json`); return response.ok ? this.fromJson(await response.text(),{deepCompact}) : null; }
  get createdTime() { return this.cocinaDoc.created ? new Date(this.cocinaDoc.created) : null; }
  get modifiedTime() { return this.cocinaDoc.modified ? new Date(this.cocinaDoc.modified) : null; }
}
export class RelatedResource extends JsonBackedRecord {
  constructor(cocina) { super({description:Object.fromEntries(Object.entries(cocina).filter(([key])=>key!=='type'))}); this.type=cocina.type; }
  get label() { return this.description.displayLabel ?? label('related_resource',this.type,data.labels.field_label.related_resource.related_to); }
  get url() { return compact([...this.urls.map(v=>v.toString()),...this.identifiers().map(v=>v.uri),this.purlUrl])[0]; }
  get hasUrl() { return !!this.url; }
  toString() { return this.displayTitle ?? this.url ?? this.label; }
  get displayData() { return [...this.titleDisplayData({excludePrimary:true}),...this.contributorDisplayData,...this.eventDisplayData,...this.generalNoteDisplayData,...this.preferredCitationDisplayData,...DisplayData.fromObjects([...this.accesses,...this.accessContacts,...this.urls].filter(v=>v.toString()!==this.url)),...this.identifierDisplayData]; }
}
export const CocinaDisplay = {CocinaRecord,RelatedResource,DisplayData,Identifier,Language,Script,Contributor,Name,NameValue,Role,Affiliation,Title,TitleValue,Subject,SubjectValue,SubjectPart,Note,NoteValue,Form,Genre,ResourceType,File,FileSet,Event,Imprint,CocinaDate,DateRange,Utils};
export default CocinaDisplay;

function coordinateNumber(value,latitude=false) {
  if (value == null) return null;
  const text=String(value).replace(/\s+/g,'');
  const hemi=text.match(/[NSEW]/i)?.[0]?.toUpperCase();
  const sign=['S','W'].includes(hemi) ? -1 : 1;
  const stripped=text.replace(/[NSEW]/ig,'');
  let number;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(stripped)) {
    if (hemi && /^\d{4,7}$/.test(stripped)) {
      const width=latitude ? 2 : 3;
      const degrees=Number(stripped.slice(0,width)); const minutes=Number(stripped.slice(width,width+2)); const seconds=Number(stripped.slice(width+2) || 0);
      number=degrees+minutes/60+seconds/3600;
    } else number=Number(stripped);
  } else {
    const match=stripped.match(/^(\d{1,3})[°⁰º]?(\d{1,2})?[ʹ′']?(\d{1,2})?[ʺ"″]?$/);
    if (!match) return null;
    number=Number(match[1])+Number(match[2]??0)/60+Number(match[3]??0)/3600;
  }
  number*=sign;
  return Number.isFinite(number) && Math.abs(number)<=(latitude?90:180) ? number : null;
}
function dms(value,latitude) {
  const hemi=latitude ? value<0?'S':'N' : value<0?'W':'E';
  const abs=Math.abs(value), degrees=Math.floor(abs), minutes=Math.floor((abs-degrees)*60), seconds=Math.round(((abs-degrees)*60-minutes)*60);
  const carriedMinutes=seconds===60 ? minutes+1 : minutes;
  return `${degrees+(carriedMinutes===60?1:0)}°${String(carriedMinutes===60?0:carriedMinutes).padStart(2,'0')}′${String(seconds===60?0:seconds).padStart(2,'0')}″${hemi}`;
}
const fmt = n => Number(n).toFixed(6);
export class Point {
  constructor(lat,lng) { this.lat=lat; this.lng=lng; }
  static fromCoords({lat,lng}) { const y=coordinateNumber(lat,true),x=coordinateNumber(lng,false); return y==null||x==null?null:new Point(y,x); }
  toString() { return `${dms(this.lat,true)} ${dms(this.lng,false)}`; }
  asWkt() { return `POINT(${fmt(this.lng)} ${fmt(this.lat)})`; }
  asEnvelope() { return null; }
  asBbox() { return null; }
  asPoint() { return `${fmt(this.lng)} ${fmt(this.lat)}`; }
}
export class BoundingBox {
  constructor({west,east,north,south}) { Object.assign(this,{west,east,north,south}); }
  static fromCoords({west,east,north,south}) { const w=coordinateNumber(west),e=coordinateNumber(east),n=coordinateNumber(north,true),s=coordinateNumber(south,true); return [w,e,n,s].some(v=>v==null)||s>n?null:new BoundingBox({west:w,east:e,north:n,south:s}); }
  get crossesAntimeridian() { return this.west>this.east; }
  get unwrappedEast() { return this.crossesAntimeridian?this.east+360:this.east; }
  toString() { return `${dms(this.west,false)} -- ${dms(this.east,false)} / ${dms(this.north,true)} -- ${dms(this.south,true)}`; }
  ring(w,e) { return `(${fmt(w)} ${fmt(this.south)}, ${fmt(e)} ${fmt(this.south)}, ${fmt(e)} ${fmt(this.north)}, ${fmt(w)} ${fmt(this.north)}, ${fmt(w)} ${fmt(this.south)})`; }
  asWkt() { return this.crossesAntimeridian ? `MULTIPOLYGON((${this.ring(this.west,180)}), (${this.ring(-180,this.east)}))` : `POLYGON(${this.ring(this.west,this.east)})`; }
  asEnvelope() { return `ENVELOPE(${fmt(this.west)}, ${fmt(this.east)}, ${fmt(this.north)}, ${fmt(this.south)})`; }
  asPoint() { const center=(this.west+this.unwrappedEast)/2; return `${fmt(center>180?center-360:center)} ${fmt((this.south+this.north)/2)}`; }
  asBbox() { return [[this.south,this.west],[this.north,this.unwrappedEast]]; }
}
export class Coordinates {
  static fromCocina(cocina) {
    const parts=array(cocina.structuredValue);
    if (parts.length===2) return Point.fromCoords({lat:parts.find(v=>v.type==='latitude')?.value,lng:parts.find(v=>v.type==='longitude')?.value});
    if (parts.length===4) return BoundingBox.fromCoords(Object.fromEntries(parts.map(v=>[v.type,v.value])));
    return this.parse(cocina.value);
  }
  static parse(value) {
    if (!value) return null;
    const text=String(value).replace(/\s+/g,'');
    const marc=text.match(/\$d(.+?)\$e(.+?)\$f(.+?)\$g(.+)/);
    if (marc) return BoundingBox.fromCoords({west:marc[1],east:marc[2],north:marc[3],south:marc[4]});
    const box=text.match(/^(.+?)--(.+?)\/(.+?)--(.+)$/);
    if (box) return BoundingBox.fromCoords({west:box[1],east:box[2],north:box[3],south:box[4]});
    const decimal=text.match(/^([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)$/);
    if (decimal) return Point.fromCoords({lat:decimal[1],lng:decimal[2]});
    const dmsMatch=text.match(/^([NS].+?|.+?[NS])([EW].+|.+[EW])$/);
    if (dmsMatch) return Point.fromCoords({lat:dmsMatch[1],lng:dmsMatch[2]});
    return null;
  }
}
Object.defineProperty(CoordinatesSubjectPart.prototype,'coordinates',{get() { return Coordinates.fromCocina(this.cocina); }});
CoordinatesSubjectPart.prototype.toString=function() { return this.coordinates?.toString() ?? this.cocina.value ?? ''; };
Object.defineProperties(JsonBackedRecord.prototype,{
  coordinateObjects:{get() { return compact(this.coordinateSubjectParts.map(v=>v.coordinates)); }},
  coordinates:{get() { return unique(compact(this.coordinateSubjectParts.map(v=>v.toString()))); }},
  coordinatesAsWkt:{get() { return unique(this.coordinateObjects.map(v=>v.asWkt())); }},
  coordinatesAsEnvelope:{get() { return unique(compact(this.coordinateObjects.map(v=>v.asEnvelope()))); }},
  coordinatesAsPoint:{get() { return unique(this.coordinateObjects.map(v=>v.asPoint())); }},
  coordinatesAsBbox:{get() { return this.coordinateObjects.map(v=>v.asBbox()).filter(Boolean); }}
});
CocinaDisplay.Coordinates=Coordinates;
CocinaDisplay.Point=Point;
CocinaDisplay.BoundingBox=BoundingBox;
