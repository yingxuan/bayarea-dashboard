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
  // 奶茶 - 至少6个以确保carousel显示
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
  {
    id: 'yifang-taiwan-fruit-tea-cupertino',
    name: 'YiFang Taiwan Fruit Tea',
    category: '奶茶',
    rating: 4.5,
    review_count: 456,
    address: '19658 Stevens Creek Blvd, Cupertino, CA 95014',
    distance_miles: 1.3,
    photo_url: 'https://via.placeholder.com/400x300?text=YiFang',
    url: 'https://maps.google.com/?q=YiFang+Taiwan+Fruit+Tea+Cupertino',
    city: 'Cupertino',
    score: 4.5 * Math.log(456),
  },
  {
    id: 'sharetea-sunnyvale',
    name: 'Sharetea',
    category: '奶茶',
    rating: 4.3,
    review_count: 389,
    address: '1088 E El Camino Real, Sunnyvale, CA 94087',
    distance_miles: 2.4,
    photo_url: 'https://via.placeholder.com/400x300?text=Sharetea',
    url: 'https://maps.google.com/?q=Sharetea+Sunnyvale',
    city: 'Sunnyvale',
    score: 4.3 * Math.log(389),
  },
  {
    id: 'boba-guys-cupertino',
    name: 'Boba Guys',
    category: '奶茶',
    rating: 4.6,
    review_count: 567,
    address: '20686 Homestead Rd, Cupertino, CA 95014',
    distance_miles: 1.7,
    photo_url: 'https://via.placeholder.com/400x300?text=Boba+Guys',
    url: 'https://maps.google.com/?q=Boba+Guys+Cupertino',
    city: 'Cupertino',
    score: 4.6 * Math.log(567),
  },
  {
    id: 'tan-cha-sunnyvale',
    name: 'Tan-Cha',
    category: '奶茶',
    rating: 4.4,
    review_count: 445,
    address: '1110 E El Camino Real, Sunnyvale, CA 94087',
    distance_miles: 2.0,
    photo_url: 'https://via.placeholder.com/400x300?text=Tan-Cha',
    url: 'https://maps.google.com/?q=Tan-Cha+Sunnyvale',
    city: 'Sunnyvale',
    score: 4.4 * Math.log(445),
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
  
  // 新店打卡 - 中餐和奶茶，review_count <= 100的新店
  {
    id: 'new-chinese-restaurant-cupertino',
    name: 'New Chinese Restaurant',
    category: '新店打卡',
    rating: 4.4,
    review_count: 25,
    address: '19620 Stevens Creek Blvd, Cupertino, CA 95014',
    distance_miles: 1.2,
    photo_url: 'https://via.placeholder.com/400x300?text=New+Chinese',
    url: 'https://maps.google.com/?q=New+Chinese+Restaurant+Cupertino',
    city: 'Cupertino',
    score: 4.4 * Math.log(25),
  },
  {
    id: 'new-bubble-tea-sunnyvale',
    name: 'New Bubble Tea Shop',
    category: '新店打卡',
    rating: 4.5,
    review_count: 18,
    address: '1135 E El Camino Real, Sunnyvale, CA 94087',
    distance_miles: 2.1,
    photo_url: 'https://via.placeholder.com/400x300?text=New+Bubble+Tea',
    url: 'https://maps.google.com/?q=New+Bubble+Tea+Sunnyvale',
    city: 'Sunnyvale',
    score: 4.5 * Math.log(18),
  },
  {
    id: 'new-chinese-sj',
    name: 'New Chinese Eatery',
    category: '新店打卡',
    rating: 4.3,
    review_count: 22,
    address: '2855 Stevens Creek Blvd, San Jose, CA 95128',
    distance_miles: 3.5,
    photo_url: 'https://via.placeholder.com/400x300?text=New+Chinese+Eatery',
    url: 'https://maps.google.com/?q=New+Chinese+Eatery+San+Jose',
    city: 'San Jose',
    score: 4.3 * Math.log(22),
  },
  {
    id: 'new-boba-milpitas',
    name: 'New Boba Place',
    category: '新店打卡',
    rating: 4.6,
    review_count: 15,
    address: '500 Barber Ln, Milpitas, CA 95035',
    distance_miles: 4.2,
    photo_url: 'https://via.placeholder.com/400x300?text=New+Boba',
    url: 'https://maps.google.com/?q=New+Boba+Place+Milpitas',
    city: 'Milpitas',
    score: 4.6 * Math.log(15),
  },
  {
    id: 'new-chinese-fremont',
    name: 'New Chinese Kitchen',
    category: '新店打卡',
    rating: 4.4,
    review_count: 28,
    address: '39100 Argonaut Way, Fremont, CA 94538',
    distance_miles: 5.1,
    photo_url: 'https://via.placeholder.com/400x300?text=New+Chinese+Kitchen',
    url: 'https://maps.google.com/?q=New+Chinese+Kitchen+Fremont',
    city: 'Fremont',
    score: 4.4 * Math.log(28),
  },
  {
    id: 'new-bubble-tea-cupertino-2',
    name: 'New Tea House',
    category: '新店打卡',
    rating: 4.5,
    review_count: 20,
    address: '20686 Homestead Rd, Cupertino, CA 95014',
    distance_miles: 1.8,
    photo_url: 'https://via.placeholder.com/400x300?text=New+Tea+House',
    url: 'https://maps.google.com/?q=New+Tea+House+Cupertino',
    city: 'Cupertino',
    score: 4.5 * Math.log(20),
  },
  {
    id: 'new-chinese-sunnyvale-2',
    name: 'Fresh Chinese Bistro',
    category: '新店打卡',
    rating: 4.3,
    review_count: 12,
    address: '1088 E El Camino Real, Sunnyvale, CA 94087',
    distance_miles: 2.3,
    photo_url: 'https://via.placeholder.com/400x300?text=Fresh+Chinese',
    url: 'https://maps.google.com/?q=Fresh+Chinese+Bistro+Sunnyvale',
    city: 'Sunnyvale',
    score: 4.3 * Math.log(12),
  },
  {
    id: 'new-boba-sj',
    name: 'Boba Fresh',
    category: '新店打卡',
    rating: 4.6,
    review_count: 8,
    address: '2855 Stevens Creek Blvd, San Jose, CA 95128',
    distance_miles: 3.8,
    photo_url: 'https://via.placeholder.com/400x300?text=Boba+Fresh',
    url: 'https://maps.google.com/?q=Boba+Fresh+San+Jose',
    city: 'San Jose',
    score: 4.6 * Math.log(8),
  },
  {
    id: 'new-chinese-milpitas-2',
    name: 'Modern Chinese Cuisine',
    category: '新店打卡',
    rating: 4.4,
    review_count: 16,
    address: '500 Barber Ln, Milpitas, CA 95035',
    distance_miles: 4.5,
    photo_url: 'https://via.placeholder.com/400x300?text=Modern+Chinese',
    url: 'https://maps.google.com/?q=Modern+Chinese+Cuisine+Milpitas',
    city: 'Milpitas',
    score: 4.4 * Math.log(16),
  },
  {
    id: 'new-bubble-tea-fremont',
    name: 'Tea Time',
    category: '新店打卡',
    rating: 4.5,
    review_count: 14,
    address: '39100 Argonaut Way, Fremont, CA 94538',
    distance_miles: 5.2,
    photo_url: 'https://via.placeholder.com/400x300?text=Tea+Time',
    url: 'https://maps.google.com/?q=Tea+Time+Fremont',
    city: 'Fremont',
    score: 4.5 * Math.log(14),
  },
  {
    id: 'new-chinese-cupertino-3',
    name: 'Dragon Wok',
    category: '新店打卡',
    rating: 4.3,
    review_count: 10,
    address: '19620 Stevens Creek Blvd, Cupertino, CA 95014',
    distance_miles: 1.5,
    photo_url: 'https://via.placeholder.com/400x300?text=Dragon+Wok',
    url: 'https://maps.google.com/?q=Dragon+Wok+Cupertino',
    city: 'Cupertino',
    score: 4.3 * Math.log(10),
  },
  {
    id: 'new-bubble-tea-sunnyvale-2',
    name: 'Milk Tea Lab',
    category: '新店打卡',
    rating: 4.6,
    review_count: 6,
    address: '1110 E El Camino Real, Sunnyvale, CA 94087',
    distance_miles: 2.0,
    photo_url: 'https://via.placeholder.com/400x300?text=Milk+Tea+Lab',
    url: 'https://maps.google.com/?q=Milk+Tea+Lab+Sunnyvale',
    city: 'Sunnyvale',
    score: 4.6 * Math.log(6),
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
