import type { BoardState, Section } from '../types.js';

const sections = (categoryId: string, names: string[]): Section[] =>
  names.map((name, i) => ({ id: `${categoryId}-s${i + 1}`, categoryId, name }));

export function createSeed(): BoardState {
  return {
    version: 1,
    categories: [
      { id: 'wedding', name: 'Wedding', tagline: 'Venues, vendors and little details for the big day.', icon: 'ring' },
      { id: 'cafe', name: 'Cafe', tagline: 'Spots worth the trip — to work, to chill, or just for cake.', icon: 'cup' },
    ],
    sections: [
      ...sections('wedding', ['Place', 'Wedding Organizer', 'Decorations']),
      ...sections('cafe', ['Greeny', 'WFCable', 'Cute', 'Sweet Cake']),
    ],
    bookmarks: [],
  };
}
