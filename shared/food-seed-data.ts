/**
 * Local Seed Data for Food Recommendations
 * 湾区热门餐厅/奶茶店/咖啡/甜品 - 本地种子数据
 * 目标：稳定推荐 6 家"今天能去的地方"
 * 不追求全量、不做实时搜索
 */

export interface FoodPlace {
  id: string;
  name: string;
  category: string; // 奶茶/中餐/咖啡/甜品
  rating: number;
  review_count: number;
  address: string;
  distance_miles: number;
  photo_url: string;
  url: string; // Google Maps URL
  city: string; // Cupertino / Sunnyvale / San Jose
  score: number; // rating * log(review_count)
}

// 湾区热门餐厅/奶茶店种子数据
export const FOOD_SEED_DATA: FoodPlace[] = [
  // 奶茶
  {
    id: 'tp-tea-cupertino',
    name: 'TP Tea',
    category: '奶茶',
    rating: 4.5,
    review_count: 523,
    address: '19620 Stevens Creek Blvd, Cupertino, CA 95014',
    distance_miles: 1.2,
    photo_url: 'https://via.placeholder.com/400x300?text=',
    url: 'https://maps.google.com/?q=TP+Tea+Cupertino',
    city: 'Cupertino',
    score: 4.5 * Math.log(523),
  },
  {
    id: 'happy-lemon-sunnyvale',
    name: 'Happy Lemon',
    category: '奶茶',
    rating: 4.4,
    review_count: 412,
    address: '1135 E El Camino Real, Sunnyvale, CA 94087',
    distance_miles: 2.1,
    photo_url: 'https://via.placeholder.com/400x300?text=Happy+Lemon',
    url: 'https://maps.google.com/?q=Happy+Lemon+Sunnyvale',
    city: 'Sunnyvale',
    score: 4.4 * Math.log(412),
  },
  {
    id: 'tiger-sugar-sj',
    name: 'Tiger Sugar',
    category: '奶茶',
    rating: 4.6,
    review_count: 678,
    address: '2855 Stevens Creek Blvd, San Jose, CA 95128',
    distance_miles: 3.5,
    photo_url: 'https://via.placeholder.com/400x300?text=Tiger+Sugar',
    url: 'https://maps.google.com/?q=Tiger+Sugar+San+Jose',
    city: 'San Jose',
    score: 4.6 * Math.log(678),
  },
  
  // 中餐
  {
    id: 'dumpling-time-cupertino',
    name: 'Dumpling Time',
    category: '中餐',
    rating: 4.3,
    review_count: 892,
    address: '20020 Stevens Creek Blvd, Cupertino, CA 95014',
    distance_miles: 1.5,
    photo_url: 'https://via.placeholder.com/400x300?text=Dumpling+Time',
    url: 'https://maps.google.com/?q=Dumpling+Time+Cupertino',
    city: 'Cupertino',
    score: 4.3 * Math.log(892),
  },
  {
    id: 'sichuan-house-sunnyvale',
    name: 'Sichuan House',
    category: '中餐',
    rating: 4.5,
    review_count: 756,
    address: '1088 E El Camino Real, Sunnyvale, CA 94087',
    distance_miles: 2.3,
    photo_url: 'https://via.placeholder.com/400x300?text=Sichuan+House',
    url: 'https://maps.google.com/?q=Sichuan+House+Sunnyvale',
    city: 'Sunnyvale',
    score: 4.5 * Math.log(756),
  },
  {
    id: 'kung-fu-noodles-sj',
    name: 'Kung Fu Noodles',
    category: '中餐',
    rating: 4.4,
    review_count: 634,
    address: '2855 Stevens Creek Blvd, San Jose, CA 95128',
    distance_miles: 3.8,
    photo_url: 'https://via.placeholder.com/400x300?text=Kung+Fu+Noodles',
    url: 'https://maps.google.com/?q=Kung+Fu+Noodles+San+Jose',
    city: 'San Jose',
    score: 4.4 * Math.log(634),
  },
  
  // 咖啡
  {
    id: 'philz-cupertino',
    name: 'Philz Coffee',
    category: '咖啡',
    rating: 4.6,
    review_count: 445,
    address: '20686 Homestead Rd, Cupertino, CA 95014',
    distance_miles: 1.8,
    photo_url: 'https://via.placeholder.com/400x300?text=Philz+Coffee',
    url: 'https://maps.google.com/?q=Philz+Coffee+Cupertino',
    city: 'Cupertino',
    score: 4.6 * Math.log(445),
  },
  {
    id: 'blue-bottle-sunnyvale',
    name: 'Blue Bottle Coffee',
    category: '咖啡',
    rating: 4.5,
    review_count: 567,
    address: '1110 E El Camino Real, Sunnyvale, CA 94087',
    distance_miles: 2.0,
    photo_url: 'https://via.placeholder.com/400x300?text=Blue+Bottle',
    url: 'https://maps.google.com/?q=Blue+Bottle+Coffee+Sunnyvale',
    city: 'Sunnyvale',
    score: 4.5 * Math.log(567),
  },
  
  // 甜品
  {
    id: 'somi-somi-sj',
    name: 'Somi Somi',
    category: '甜品',
    rating: 4.7,
    review_count: 789,
    address: '2855 Stevens Creek Blvd, San Jose, CA 95128',
    distance_miles: 3.6,
    photo_url: 'https://via.placeholder.com/400x300?text=Somi+Somi',
    url: 'https://maps.google.com/?q=Somi+Somi+San+Jose',
    city: 'San Jose',
    score: 4.7 * Math.log(789),
  },
  {
    id: 'matcha-cafe-cupertino',
    name: 'Matcha Cafe Maiko',
    category: '甜品',
    rating: 4.6,
    review_count: 623,
    address: '19620 Stevens Creek Blvd, Cupertino, CA 95014',
    distance_miles: 1.3,
    photo_url: 'https://via.placeholder.com/400x300?text=Matcha+Cafe',
    url: 'https://maps.google.com/?q=Matcha+Cafe+Maiko+Cupertino',
    city: 'Cupertino',
    score: 4.6 * Math.log(623),
  },
  {
    id: 'sul-bing-sunnyvale',
    name: 'Sul & Beans',
    category: '甜品',
    rating: 4.5,
    review_count: 512,
    address: '1135 E El Camino Real, Sunnyvale, CA 94087',
    distance_miles: 2.2,
    photo_url: 'https://via.placeholder.com/400x300?text=Sul+Beans',
    url: 'https://maps.google.com/?q=Sul+Beans+Sunnyvale',
    city: 'Sunnyvale',
    score: 4.5 * Math.log(512),
  },
];

/**
 * Get food recommendations from seed data
 * Returns 6 items, balanced across categories
 */
export function getFoodRecommendationsFromSeed(): FoodPlace[] {
  // Group by category
  const byCategory: Record<string, FoodPlace[]> = {
    '奶茶': [],
    '中餐': [],
    '咖啡': [],
    '甜品': [],
  };
  
  FOOD_SEED_DATA.forEach(place => {
    if (byCategory[place.category]) {
      byCategory[place.category].push(place);
    }
  });
  
  // Select balanced mix: 2 奶茶, 2 中餐, 1 咖啡, 1 甜品
  const selected: FoodPlace[] = [];
  
  // 奶茶 - 取 top 2
  selected.push(...byCategory['奶茶'].sort((a, b) => b.score - a.score).slice(0, 2));
  
  // 中餐 - 取 top 2
  selected.push(...byCategory['中餐'].sort((a, b) => b.score - a.score).slice(0, 2));
  
  // 咖啡 - 取 top 1
  selected.push(...byCategory['咖啡'].sort((a, b) => b.score - a.score).slice(0, 1));
  
  // 甜品 - 取 top 1
  selected.push(...byCategory['甜品'].sort((a, b) => b.score - a.score).slice(0, 1));
  
  // Ensure we have exactly 6 items
  if (selected.length < 6) {
    // Fill remaining slots from all categories, sorted by score
    const remaining = FOOD_SEED_DATA
      .filter(p => !selected.find(s => s.id === p.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6 - selected.length);
    selected.push(...remaining);
  }
  
  return selected.slice(0, 6);
}
