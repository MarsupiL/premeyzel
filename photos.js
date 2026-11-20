import { cardArt } from './art.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_LENGTH = 320 * 1024;
const FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const SAMPLE_ART = [
  'oven',
  'webapp',
  'icecream',
  'campervan',
  'garden',
  'orchard',
  'table',
  'trailer',
  'eggs',
  'tools',
  'plant',
  'dog',
  'forest',
  'mountain',
];
const CATEGORY_ART = {
  events: {
    Rencontre: 'event-meeting',
    Convivialité: 'event-table',
    Atelier: 'event-workshop',
    Sport: 'event-sport',
    Culture: 'event-culture',
  },
  ads: {
    'À donner': 'ad-give',
    'À louer': 'ad-rent',
    'À prêter': 'ad-lend',
    'À échanger': 'ad-swap',
    Services: 'ad-services',
    'Je recherche': 'ad-wanted',
    'À vendre': 'ad-sell',
    'Perdu / trouvé': 'ad-lost',
  },
  trails: {
    Marche: 'trail-hiking',
    VTT: 'trail-cycling',
  },
};
export const defaultArt = (type, category) =>
  Object.getOwnPropertyDescriptor(CATEGORY_ART[type] || {}, category)?.value ||
  { events: 'table', trips: 'campervan', ads: 'plant', trails: 'forest' }[type] ||
  'plant';
export const samplePhoto = (art) => (SAMPLE_ART.includes(art) ? `sample:${art}` : null);
export function validPhoto(photo) {
  return (
    photo === null ||
    (typeof photo === 'string' &&
      (SAMPLE_ART.some((art) => photo === `sample:${art}`) ||
        (photo.length <= MAX_PHOTO_LENGTH &&
          /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))))
  );
}
export function photoSource(photo) {
  if (!photo || !validPhoto(photo)) return '';
  if (photo.startsWith('sample:')) {
    const svg = cardArt(photo.slice(7)).replace(
      '<svg ',
      '<svg xmlns="http://www.w3.org/2000/svg" ',
    );
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return photo;
}
export function validatePhotoFile(file) {
  if (!file || !FORMATS.includes(file.type))
    throw new Error('Choisissez une photo au format JPEG, PNG ou WebP.');
  if (!file.size) throw new Error('Ce fichier est vide. Choisissez une autre photo.');
  if (file.size > MAX_FILE_BYTES)
    throw new Error('Cette photo dépasse 10 Mo. Choisissez une version plus légère.');
}
// Resize and re-encode locally: bounded storage, upright pixels and no source metadata.
export async function preparePhoto(file, { maxDimension = 1280, square = false } = {}) {
  validatePhotoFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error('Cette photo est illisible. Essayez un autre fichier JPEG, PNG ou WebP.');
    }
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 60000000
    )
      throw new Error(
        'Cette photo est trop grande. Choisissez une version de moins de 60 mégapixels.',
      );
    const sourceWidth = square
      ? Math.min(image.naturalWidth, image.naturalHeight)
      : image.naturalWidth;
    const sourceHeight = square ? sourceWidth : image.naturalHeight;
    let scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx)
      throw new Error(
        'Le navigateur ne peut pas préparer cette photo. Essayez un autre navigateur.',
      );
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      ctx.fillStyle = '#fffef5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        image,
        (image.naturalWidth - sourceWidth) / 2,
        (image.naturalHeight - sourceHeight) / 2,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const result = canvas.toDataURL('image/jpeg', attempt ? 0.72 : 0.84);
      if (validPhoto(result)) return result;
      scale *= 0.75;
    }
    throw new Error('Impossible d’alléger cette photo. Choisissez une autre image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
