export interface NewPlaceEntry {
  placeId: string;
  displayName: string;
  city?: string;
  formattedAddress?: string;
  kind: 'chinese' | 'milk-tea';
  rating?: number;
  userRatingCount?: number;
  earliestReviewTime?: string;
  firstSeenAt?: string;
  score: number;
  why: string[];
}

export interface NewPlacesSnapshot {
  generatedAt: string;
  windowDays: number;
  tiles: number;
  queries: number;
  candidates: number;
  places: NewPlaceEntry[];
}
