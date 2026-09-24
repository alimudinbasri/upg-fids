// ============================================================
// APP CONFIG — shared constants used across the M-FIDS pages.
// Single source of truth so gate/belt layout, airline mapping and
// the flight-data endpoint don't drift out of sync between pages.
// Load this BEFORE js/firebase-config.js / js/auth-guard.js and
// before any page-specific inline <script>.
// ============================================================
const APP_CONFIG = {
  // Google Apps Script web app that serves flight data (arrivals/departures).
  gasUrl: "https://script.google.com/macros/s/AKfycbzLs6ujBfTTDKPFTdCxiFJZvnvd6hSuVffPcOGmI9DNOSf1DRMazeaVAEI6m5mlmiF7zA/exec",

  // App-level admins. Mirrors isHardcodedAdmin() in firestore.rules —
  // keep both in sync (Firestore rules can't read this file directly).
  adminEmails: [
    "alimudinbasri@gmail.com",
    "alimudin.basri@injourneyairports.id",
    "upg.pl@injourneyairports.id"
  ],

  // Anyone with a verified address on these domains may use the app; other
  // accounts need an allowed_users/{emailKey} doc (managed in admin.html).
  // Mirrors inAllowedDomain() in firestore.rules — keep both in sync.
  // gmail.com: every verified Gmail account, by the owner's decision.
  allowedDomains: ["injourneyairports.id", "gmail.com"],

  // Presence: how often an open tab refreshes its lastSeen, and how recent
  // lastSeen must be to count as online (a bit over two beats, so one
  // missed write doesn't flicker a user offline).
  presenceHeartbeatMs: 5 * 60 * 1000,
  onlineWindowMs:      11 * 60 * 1000,

  defaultGates: ['1','2','3','4','5','6','6A','7','8','9','9A','10','11','11A','11B','12'],
  gateMeta: {
    '1':   {seat:64,  max:107, status:'DOM'},
    '2':   {seat:89,  max:148, status:'DOM'},
    '3':   {seat:106, max:177, status:'DOM'},
    '4':   {seat:262, max:437, status:'DOM'},
    '5':   {seat:276, max:460, status:'DOM'},
    '6':   {seat:208, max:347, status:'DOM'},
    '6A':  {seat:176, max:293, status:'DOM'},
    '7':   {seat:310, max:517, status:'DOM'},
    '8':   {seat:127, max:212, status:'DOM'},
    '9':   {seat:100, max:167, status:'DOM'},
    '9A':  {seat:100, max:167, status:'DOM'},
    '10':  {seat:214, max:357, status:'DOM'},
    '11':  {seat:300, max:500, status:'INT'},
    '11A': {seat:200, max:333, status:'INT'},
    '11B': {seat:420, max:700, status:'INT'},
    '12':  {seat:300, max:500, status:'INT'},
    'NO GATE': {seat:0, max:0, status:'NO GATE', off:false}
  },

  // Terminal gate groupings used in WA Report and terminal stats
  terminalGroups: [
    { id: 'TS',    name: 'TS (Gate 1-6, 6A)',              gates: ['1','2','3','4','5','6','6A'] },
    { id: 'TE',    name: 'TE (Gate 7-10, 9A)',             gates: ['7','8','9','9A','10'] },
    { id: 'INTER', name: 'INTER (Gate 11, 12, 11A, 11B)',  gates: ['11','12','11A','11B'] }
  ],

  defaultBelts: ['1','2','3','4','5','6','7','8','9','10'],
  beltMeta: {
    '1':  {status:'INT'},
    '2':  {status:'INT'},
    '3':  {status:'INT'},
    '4':  {status:'DOM'},
    '5':  {status:'DOM'},
    '6':  {status:'DOM'},
    '7':  {status:'DOM'},
    '8':  {status:'DOM'},
    '9':  {status:'DOM'},
    '10': {status:'DOM'},
    'NO BELT': {status:'NO BELT', off:false}
  },

  airlineMap: {
    JT:'LION AIR', ID:'BATIK AIR', IW:'WINGS AIR', IP:'PELITA AIR',
    GA:'GARUDA', QG:'CITILINK', IU:'SUPER AIR JET', SJ:'SRIWIJAYA AIR',
    IN:'NAM AIR', TR:'SCOOT', AK:'AIRASIA', QZ:'AIRASIA', OD:'BATIK AIR',
    SQ:'SINGAPORE AIRLINES', MH:'MALAYSIA AIRLINES', KS:'SUSI AIR'
  },

  prefixColorFixed: {
    JT:'#dc2626', SJ:'#0891b2', GA:'#2563eb', ID:'#7c3aed', IU:'#f59e0b',
    QG:'#16a34a', IW:'#0e7490', IP:'#ea580c', TR:'#9333ea', AK:'#be123c',
    QZ:'#65a30d', KS:'#312e81', SQ:'#1d4ed8', MH:'#0f766e', OD:'#9f1239',
    '8B':'#047857', '5J':'#ca8a04'
  },

  prefixColorPalette: [
    '#dc2626','#0891b2','#2563eb','#7c3aed','#f59e0b','#16a34a',
    '#0e7490','#ea580c','#9333ea','#be123c','#65a30d','#312e81',
    '#1d4ed8','#0f766e','#9f1239','#ca8a04','#047857','#c2410c',
    '#4338ca','#b45309','#0369a1','#a21caf','#15803d','#be185d',
    '#4d7c0f','#0f172a','#475569','#7f1d1d','#164e63','#581c87'
  ]
};
