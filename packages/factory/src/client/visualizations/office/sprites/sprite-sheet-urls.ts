// Character idle sprites
import adamUrl from './assets/Adam_idle_32x32.png';
import alexUrl from './assets/Alex_idle_32x32.png';
import ameliaUrl from './assets/Amelia_idle_32x32.png';
import ashUrl from './assets/Ash_idle_32x32.png';
import bobUrl from './assets/Bob_idle_32x32.png';
import danUrl from './assets/Dan_idle_32x32.png';
// Office furniture sheet
import officeUrl from './assets/Modern_Office_Black_Shadow_32x32.png';
// Furniture singles
import plant100Url from './assets/Modern_Office_Singles_32x32_100.png';
import certificate113Url from './assets/Modern_Office_Singles_32x32_113.png';
import certificate114Url from './assets/Modern_Office_Singles_32x32_114.png';
import diploma116Url from './assets/Modern_Office_Singles_32x32_116.png';
import deskLamp141Url from './assets/Modern_Office_Singles_32x32_141.png';
import chartBoard171Url from './assets/Modern_Office_Singles_32x32_171.png';
import analysisBoard172Url from './assets/Modern_Office_Singles_32x32_172.png';
import dashboard175Url from './assets/Modern_Office_Singles_32x32_175.png';
import workshopDesk183Url from './assets/Modern_Office_Singles_32x32_183.png';
import prepDesk186Url from './assets/Modern_Office_Singles_32x32_186.png';
import modernShelf205Url from './assets/Modern_Office_Singles_32x32_205.png';
import execShelf206Url from './assets/Modern_Office_Singles_32x32_206.png';
import robUrl from './assets/Rob_idle_32x32.png';
// Room builder sheets
import shadowsUrl from './assets/Room_Builder_Floor_Shadows_32x32.png';
import floorsUrl from './assets/Room_Builder_Floors_32x32.png';
import wallsUrl from './assets/Room_Builder_Walls_32x32.png';

/** Identifies the four sprite sheet types used for room and office rendering. */
export type RoomSheetKey = 'floors' | 'walls' | 'shadows' | 'office';

/** Identifies individual furniture pieces loaded as standalone sprites. */
export type SingleAssetKey =
  | 'analysisBoard172'
  | 'certificate113'
  | 'certificate114'
  | 'chartBoard171'
  | 'dashboard175'
  | 'deskLamp141'
  | 'diploma116'
  | 'execShelf206'
  | 'modernShelf205'
  | 'plant100'
  | 'prepDesk186'
  | 'workshopDesk183';

/** Identifies character sprites by name. */
export type CharacterName = 'Adam' | 'Alex' | 'Amelia' | 'Ash' | 'Bob' | 'Dan' | 'Rob';

/** Maps each room/office sheet type to the URL of its sprite sheet asset. */
export const ROOM_SHEET_URLS: Record<RoomSheetKey, string> = {
  floors: floorsUrl,
  walls: wallsUrl,
  shadows: shadowsUrl,
  office: officeUrl,
};

/** Maps each furniture single key to the URL of its standalone asset. */
export const SINGLE_ASSET_URLS: Record<SingleAssetKey, string> = {
  analysisBoard172: analysisBoard172Url,
  certificate113: certificate113Url,
  certificate114: certificate114Url,
  chartBoard171: chartBoard171Url,
  dashboard175: dashboard175Url,
  deskLamp141: deskLamp141Url,
  diploma116: diploma116Url,
  execShelf206: execShelf206Url,
  modernShelf205: modernShelf205Url,
  plant100: plant100Url,
  prepDesk186: prepDesk186Url,
  workshopDesk183: workshopDesk183Url,
};

/** Maps each character name to the URL of its idle sprite sheet. */
export const CHARACTER_URLS: Record<CharacterName, string> = {
  Adam: adamUrl,
  Alex: alexUrl,
  Amelia: ameliaUrl,
  Ash: ashUrl,
  Bob: bobUrl,
  Dan: danUrl,
  Rob: robUrl,
};
