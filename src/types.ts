export type ProgressState='unknown'|'collected'|'missing';
export type MarkerSource='official'|'community';
export interface Marker{id:string;sourceId:string;source:MarkerSource;name:string;category:string;region:string;area:string;x:number;y:number;}
export interface ProgressRecord{markerId:string;state:ProgressState;updatedAt:string;}
export interface OfficialMeta{mapId:number;mapVersion:string;gameVersion:string;origin:[number,number];totalSize:[number,number];minZoom:number;maxZoom:number;tileUrlTemplate:string;cdnTileUrlTemplate:string;fetchedAt:string;}
export interface ImportReport{imported:number;skipped:number;warnings:string[];}
