export interface Category {
  id: string;
  name: string;
  tagline: string;
}

export interface Section {
  id: string;
  categoryId: string;
  name: string;
}

export interface Bookmark {
  id: string;
  sectionId: string;
  title: string;
  url: string;
  note: string;
  imageUrl: string;
  createdAt: number;
}

/** Order inside each array is the display order. */
export interface BoardState {
  version: 1;
  categories: Category[];
  sections: Section[];
  bookmarks: Bookmark[];
}
