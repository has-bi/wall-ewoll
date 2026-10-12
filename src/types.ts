export interface Category {
  id: string;
  name: string;
  tagline: string;
  /** One of CATEGORY_ICONS; empty means the generic grid icon. */
  icon: string;
}

export interface Section {
  id: string;
  categoryId: string;
  name: string;
}

/** Every bookmark is normalised to the same three things on the card: thumbnail, title, description. */
export interface Bookmark {
  id: string;
  sectionId: string;
  title: string;
  url: string;
  description: string;
  /** Original image URL (og:image, tweet photo, TikTok cover…). Empty when the link has none. */
  imageUrl: string;
  /** Version token of the server-cached copy of imageUrl; set when /api/thumb can serve it. */
  thumb?: string;
  createdAt: number;
}

/** Order inside each array is the display order. */
export interface BoardState {
  version: 1;
  categories: Category[];
  sections: Section[];
  bookmarks: Bookmark[];
}
