// Category scenes extend the original card drawings: the same 400 × 220 canvas,
// flat shapes and village palette. Legacy drawings are reused without their backdrop.
const group = (x, y, scale, drawing) =>
  `<g transform="translate(${x} ${y}) scale(${scale})">${drawing}</g>`;
const ground = '<path d="M0 186q198-22 400 0v34H0Z" fill="#c8d5b1"/>';
const drawings = {
  bread: `<path d="m24 99 12 33h104l13-33" fill="#aa7b4f"/><path d="M36 100q-13-31 15-46 32-10 39 44" fill="#c59358"/><path d="M77 99q-4-43 25-45 29 1 29 45" fill="#d3a46a"/><path d="m43 68 17 13m-10-24 18 13m32-2 17 7m-17 6 20 7" stroke="#f1d39a" stroke-width="5" stroke-linecap="round"/><path d="M25 102h126m-114 12h104m-108 10h99" stroke="#ddbb8b" stroke-width="4"/>`,
  brushes: `<path d="m48 116-17-73m39 73L91 31m-33 87 1-75" stroke="#a97d55" stroke-width="8" stroke-linecap="round"/><path d="m22 44-6-24q8-7 17-5l8 25Z" fill="#789968"/><path d="m83 31 7-26q12 1 15 9L97 37Z" fill="#c8835f"/><path d="M51 45V19q8-6 16 0v26Z" fill="#d39b59"/><path d="m25 96 10 65h51l11-65Z" fill="#9daea0"/><path d="M39 109h43m-40 14h37" stroke="#c8d5b1" stroke-width="4" stroke-linecap="round"/>`,
  bike: `<g fill="#e5ead9" stroke="#46534a" stroke-width="8"><circle cx="59" cy="135" r="43"/><circle cx="201" cy="135" r="43"/></g><g fill="none" stroke="#9daea0" stroke-width="2"><path d="M59 93v84M17 135h84M29 105l60 60m-60 0 60-60M201 93v84m-42-42h84m-72-30 60 60m-60 0 60-60"/></g><path d="m59 135 40-66 37 66H59m40-66h78l-41 66m41-66 24 66m-24-66-6-22h23M99 69l-8-21" fill="none" stroke="#b67c50" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M77 47h31m63 0 18-8h16" stroke="#46534a" stroke-width="6" stroke-linecap="round"/><circle cx="136" cy="135" r="9" fill="#59705e"/><path d="m136 135 10 13h13" stroke="#59705e" stroke-width="4" fill="none"/>`,
  boot: `<path d="M17 20h47l3 52q11 13 34 16 17 3 16 25H13V71Z" fill="#a97d55"/><path d="M17 20h47v16H17Z" fill="#59705e"/><path d="m41 42 24 2m-25 12 26 3m-25 11 30 5" stroke="#ead7ad" stroke-width="5" stroke-linecap="round"/><path d="M10 110h110v15H10Z" fill="#46534a"/><path d="M20 124v6m21-6v6m21-6v6m21-6v6m21-6v6" stroke="#46534a" stroke-width="6"/>`,
  book: `<path d="M16 25q43-15 78 4 36-19 79-4v107q-43-13-79 5-35-18-78-5Z" fill="#9daea0"/><path d="M23 18q38-12 71 7 32-19 72-7v103q-40-12-72 7-33-19-71-7Z" fill="#fff8e7"/><path d="M94 25v103" stroke="#d6c7a6" stroke-width="3"/><path d="m36 43 38 5m-38 15 38 5m-38 15 38 5m38-40 38-5m-38 25 38-5m-38 25 38-5" stroke="#c6c9ab" stroke-width="4" stroke-linecap="round"/><path d="M128 18v41l9-7 9 5V17" fill="#c8835f"/>`,
  guitar: `<path d="M49 74q-29-13-40 11-10 19 6 33-23 15-17 40 9 34 46 26 38-6 35-35-2-19-18-28 14-20 2-37Z" fill="#c59358"/><path d="m42 95 17-71 17 4-17 72" fill="#897454"/><path d="m57 25 6-24 24 5-7 24Z" fill="#a97d55"/><path d="m61 7-7-2m6 13-8-1m32-4 7 2m-10 8 7 2" stroke="#59705e" stroke-width="4" stroke-linecap="round"/><circle cx="41" cy="117" r="16" fill="#725d40"/><circle cx="41" cy="117" r="10" fill="#463e32"/><path d="m21 151 30 7" stroke="#725d40" stroke-width="9"/><path d="m68 26-35 129m40-128-35 129" stroke="#e9d5ac" stroke-width="1.5"/>`,
  ladder: `<path d="m35 18-23 169m69-169L58 187" stroke="#a97d55" stroke-width="9" stroke-linecap="round"/><path d="M32 39h45M28 69h45M24 99h45M20 129h45M16 159h45" stroke="#d3a46a" stroke-width="7"/><path d="m83 25 49 161m-64-39h52" stroke="#897454" stroke-width="7" fill="none"/>`,
  watering: `<path d="M57 76q15-55 66-29l-4 41" stroke="#59705e" stroke-width="9" fill="none"/><path d="m43 87-28-34-14 8 30 61" fill="#9daea0"/><path d="M48 74h79l-7 78H57Z" fill="#829e80"/><path d="M121 88q56-10 44 29-9 19-42 11" stroke="#59705e" stroke-width="10" fill="none"/><path d="m2 52 12-9 13 16-18 13Z" fill="#59705e"/><path d="M65 91v45" stroke="#b8c9a5" stroke-width="6" stroke-linecap="round"/>`,
  apples: `<path d="m11 104 19 37h107l18-37Z" fill="#bd8c51"/><g fill="#c77845"><path d="M21 83q-1-27 24-26 21-13 31 11 10 27-16 42-34 13-39-27Z"/><path d="M77 76q0-27 25-26 20-13 31 11 10 27-15 42-35 13-41-27Z"/></g><path d="m49 60-4-18m63 10-4-17" stroke="#827455" stroke-width="4" stroke-linecap="round"/><path d="M49 50q7-23 29-13-7 20-29 13m59-9q9-19 26-12-6 18-26 12" fill="#789968"/><path d="M26 116h113m-107 12h101" stroke="#e1b881" stroke-width="4"/>`,
  honey: `<rect x="17" y="44" width="84" height="111" rx="15" fill="#d5a256"/><rect x="22" y="32" width="74" height="20" rx="4" fill="#897454"/><rect x="25" y="82" width="68" height="44" rx="4" fill="#f2e4c2"/><path d="m49 91 17-1 9 14-9 14H49l-9-14Z" fill="#d5a256"/><path d="M30 60v17" stroke="#edc979" stroke-width="5" stroke-linecap="round"/><path d="m117 78 16-59" stroke="#a97d55" stroke-width="7" stroke-linecap="round"/><path d="m126 21 17 5m-20 3 17 5m-20 3 17 5" stroke="#d3a46a" stroke-width="7" stroke-linecap="round"/>`,
  caregiver: `<path d="M49 72q-16-11-10-40 9-34 41-22 26 8 21 39l-9 21Z" fill="#725d40"/><circle cx="70" cy="44" r="22" fill="#ddbb8b"/><path d="M46 32q22 1 34-17l14 23q2-35-23-33-29-2-25 27Z" fill="#725d40"/><path d="M48 75q24-16 43 1l16 74H34Z" fill="#789968"/><path d="m49 90-19 44 41 21m20-66 29 28-22 29" stroke="#ddbb8b" stroke-width="14" stroke-linecap="round" fill="none"/><path d="M49 150v43m37-43v43" stroke="#59705e" stroke-width="17" stroke-linecap="round"/><path d="M41 193h19m18 0h20" stroke="#725d40" stroke-width="9" stroke-linecap="round"/><circle cx="108" cy="98" r="17" fill="#ddbb8b"/><path d="M91 94q0-22 18-21 22 1 19 23-11-3-16-12-7 12-21 10Z" fill="#a97d55"/><path d="M94 119q16-11 28 2l12 42H83Z" fill="#c8835f"/><path d="m96 129-21 14m44-12 19 13" stroke="#ddbb8b" stroke-width="10" stroke-linecap="round"/><path d="M96 163v30m24-30v30" stroke="#897454" stroke-width="11" stroke-linecap="round"/><path d="M91 193h11m13 0h13" stroke="#59705e" stroke-width="7" stroke-linecap="round"/>`,
  broom: `<path d="M78 10 45 136" stroke="#a97d55" stroke-width="8" stroke-linecap="round"/><path d="m31 128 33 9 6 56-63-17Z" fill="#d3b77a"/><path d="m32 129 32 9-3 13-33-9Z" fill="#c8835f"/><path d="m34 151-13 27m24-24-6 29m17-26-1 30" stroke="#aa8b52" stroke-width="3"/>`,
  toolbox: `<path d="M58 68V52q0-9 9-9h37q9 0 9 9v16" stroke="#59705e" stroke-width="8" fill="none"/><rect x="21" y="66" width="133" height="89" rx="8" fill="#b67c50"/><path d="M21 95h133" stroke="#895b3e" stroke-width="4"/><rect x="76" y="87" width="22" height="22" rx="3" fill="#ddbb8b"/><path d="M34 116v23m106-23v23" stroke="#c99260" stroke-width="4" stroke-linecap="round"/>`,
  magnifier: `<circle cx="66" cy="64" r="42" fill="#d5e1d5" stroke="#59705e" stroke-width="9"/><path d="m97 96 43 45" stroke="#a97d55" stroke-width="18" stroke-linecap="round"/><path d="M44 63q0-21 22-22" stroke="#fff8e7" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  chair: `<rect x="33" y="19" width="100" height="113" rx="24" fill="#829e80"/><rect x="44" y="30" width="78" height="70" rx="16" fill="#9eb08a"/><path d="M29 130v28m110-28v28" stroke="#897454" stroke-width="10" stroke-linecap="round"/><rect x="27" y="96" width="116" height="46" rx="12" fill="#789563"/><rect x="16" y="76" width="28" height="62" rx="12" fill="#5f8052"/><rect x="122" y="76" width="28" height="62" rx="12" fill="#5f8052"/><path d="M48 106h71" stroke="#b7c69b" stroke-width="4" stroke-linecap="round"/>`,
  lamp: `<path d="M55 69v109" stroke="#897454" stroke-width="7"/><path d="m32 14-22 62h91L79 14Z" fill="#eddbc0"/><path d="M9 76h93" stroke="#c59358" stroke-width="5" stroke-linecap="round"/><ellipse cx="55" cy="179" rx="34" ry="8" fill="#897454"/><path d="M77 81v19" stroke="#a97d55" stroke-width="2"/><circle cx="77" cy="102" r="3" fill="#a97d55"/>`,
  cat: `<path d="M60 142q-47 13-44-31 2-18-9-25" fill="none" stroke="#a97d55" stroke-width="18" stroke-linecap="round"/><ellipse cx="87" cy="126" rx="39" ry="49" fill="#c59358"/><path d="M56 67 52 23 78 43q15-5 30 0l25-20-4 48q4 35-36 38-39-2-37-42Z" fill="#c59358"/><path d="m59 38 15 12-13 7m62-19-15 12 12 7" fill="#dfb6a2"/><path d="M80 113q18-13 29 0l-3 43H78Z" fill="#f3e3c4"/><path d="M69 150v24m38-24v24" stroke="#c59358" stroke-width="15" stroke-linecap="round"/><g fill="#394c3b"><circle cx="77" cy="69" r="3"/><circle cx="109" cy="69" r="3"/><path d="m88 80 5 5 5-5Z"/></g><path d="m71 81-24-4m24 12-24 5m68-13 24-4m-24 12 24 5" stroke="#897454" stroke-width="2" stroke-linecap="round"/>`,
  keys: `<circle cx="58" cy="42" r="25" fill="none" stroke="#897454" stroke-width="6"/><g transform="rotate(20 46 68)"><circle cx="46" cy="72" r="15" fill="none" stroke="#d3a46a" stroke-width="9"/><path d="M46 88v66h18m-18-17h13" stroke="#d3a46a" stroke-width="9" fill="none" stroke-linejoin="round"/></g><g transform="rotate(-18 77 65)"><circle cx="77" cy="72" r="15" fill="none" stroke="#81967b" stroke-width="9"/><path d="M77 88v57h18m-18-16h13" stroke="#81967b" stroke-width="9" fill="none" stroke-linejoin="round"/></g>`,
  neighbours: `<path d="M62 111h179v25H62m18-25V87h144v24" fill="#a97d55"/><path d="M79 137v53m147-53v53" stroke="#897454" stroke-width="8"/><circle cx="119" cy="56" r="20" fill="#ddbb8b"/><path d="M99 54q-2-26 20-25 23 1 21 25l-12-13-14 9Z" fill="#725d40"/><path d="M100 82q20-12 38 1l8 50h-52Z" fill="#789968"/><path d="m107 132-6 49m32-49 8 49" stroke="#59705e" stroke-width="14" stroke-linecap="round"/><path d="m103 93-17 30m49-30 22 23" stroke="#ddbb8b" stroke-width="10" stroke-linecap="round"/><circle cx="190" cy="57" r="20" fill="#c99260"/><path d="M170 53q-1-25 22-25 21 2 19 24l-13-12q-8 15-28 13Z" fill="#897454"/><path d="M174 82q20-10 36 3l5 48h-51Z" fill="#c8835f"/><path d="m174 133-3 48m31-48 9 48" stroke="#897454" stroke-width="14" stroke-linecap="round"/><path d="m178 95-19 21m46-21 20 26" stroke="#c99260" stroke-width="10" stroke-linecap="round"/>`,
  conversation: `<path d="M10 9h61q10 0 10 10v29q0 10-10 10H37L23 72V58H10Q0 58 0 48V19Q0 9 10 9Z" fill="#fff8e7"/><path d="M22 29h36M22 40h24" stroke="#9eb08a" stroke-width="4" stroke-linecap="round"/><path d="M68 75h49q8 0 8 8v24q0 8-8 8h-8v13l-14-13H68q-8 0-8-8V83q0-8 8-8Z" fill="#c8d5b1"/><path d="M76 91h31M76 101h19" stroke="#789968" stroke-width="4" stroke-linecap="round"/>`,
};

export function categoryArt(kind, legacy) {
  const scene = (...elements) => ground + elements.join('');
  switch (kind) {
    case 'event-meeting':
      return scene(
        group(4, 24, 0.9, drawings.neighbours),
        group(263, 22, 0.9, drawings.conversation),
      );
    case 'event-table':
      return scene(group(-6, 20, 0.88, legacy('table')), group(210, 57, 0.5, drawings.bread));
    case 'event-workshop':
      return scene(group(-53, 10, 0.88, legacy('plant')), group(238, 32, 1, drawings.brushes));
    case 'event-sport':
      return scene(group(12, 31, 0.95, drawings.bike), group(275, 76, 0.8, drawings.boot));
    case 'event-culture':
      return scene(group(28, 44, 1, drawings.book), group(285, 16, 0.95, drawings.guitar));
    case 'ad-give':
      return scene(group(-48, 10, 0.88, legacy('plant')), group(185, 58, 0.63, legacy('eggs')));
    case 'ad-rent':
      return scene(group(0, 50, 0.68, legacy('trailer')), group(164, 70, 0.6, legacy('tools')));
    case 'ad-lend':
      return scene(group(49, 4, 1, drawings.ladder), group(209, 36, 0.98, drawings.watering));
    case 'ad-swap':
      return scene(group(32, 47, 1, drawings.apples), group(235, 29, 1, drawings.honey));
    case 'ad-services':
      return scene(group(56, 6, 0.95, drawings.caregiver), group(265, 1, 1, drawings.broom));
    case 'ad-wanted':
      return scene(group(204, 31, 1, drawings.toolbox), group(26, 25, 1, drawings.magnifier));
    case 'ad-sell':
      return scene(group(47, 30, 1, drawings.chair), group(252, 7, 1, drawings.lamp));
    case 'ad-lost':
      return scene(group(41, 13, 1, drawings.cat), group(233, 20, 1, drawings.keys));
    default:
      return '';
  }
}
