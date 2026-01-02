/**
 * Blind Box Card Component
 * Shows a "盲盒" card that reveals a random place on click
 */

import { useState, useEffect } from "react";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";
import { MapPin, Star } from "lucide-react";

interface SpendPlace {
  id: string;
  name: string;
  category: string;
  rating: number;
  user_ratings_total: number;
  distance_miles?: number;
  photo_url?: string;
  maps_url: string;
  city: string;
}

interface BlindBoxCardProps {
  randomPool: SpendPlace[];
  fallbackImage: string;
  onReveal?: (place: SpendPlace) => void;
}

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

/**
 * Dice Animation Component
 * Cycles through dice faces during animation
 */
function DiceAnimation() {
  const [currentFace, setCurrentFace] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFace((prev) => (prev + 1) % 6);
    }, 100); // Change face every 100ms

    return () => clearInterval(interval);
  }, []);

  const DiceIcon = DICE_ICONS[currentFace];
  
  return (
    <div className="animate-bounce">
      <DiceIcon className="w-12 h-12 text-primary" />
    </div>
  );
}

export default function BlindBoxCard({ randomPool, fallbackImage, onReveal }: BlindBoxCardProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [revealedPlace, setRevealedPlace] = useState<SpendPlace | null>(null);
  const [lastPickedId, setLastPickedId] = useState<string | null>(null);

  const handleClick = () => {
    if (isRolling || randomPool.length === 0) {
      // If no pool, do nothing (should not happen if API works correctly)
      return;
    }

    // If already revealed, reroll
    if (revealedPlace) {
      setIsRolling(true);
      setRevealedPlace(null);
      
      setTimeout(() => {
        pickRandomPlace();
      }, 1500);
      return;
    }

    // First roll
    setIsRolling(true);
    setTimeout(() => {
      pickRandomPlace();
    }, 1500);
  };

  const pickRandomPlace = () => {
    if (randomPool.length === 0) {
      setIsRolling(false);
      return;
    }

    // Filter out last picked place to avoid immediate repeats
    const availablePlaces = randomPool.filter(p => p.id !== lastPickedId);
    const pool = availablePlaces.length > 0 ? availablePlaces : randomPool;
    
    // Random selection
    const randomIndex = Math.floor(Math.random() * pool.length);
    const selected = pool[randomIndex];
    
    setRevealedPlace(selected);
    setLastPickedId(selected.id);
    setIsRolling(false);
    
    if (onReveal) {
      onReveal(selected);
    }
  };

  // If revealed, show as normal place card
  if (revealedPlace && !isRolling) {
    const photoUrl = revealedPlace.photo_url || fallbackImage;
    return (
      <a
        href={revealedPlace.maps_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-44 rounded-lg overflow-hidden bg-card/50 border border-primary/50 hover:border-primary transition-all group"
      >
        {/* Place Image */}
        <div className="relative w-full h-32 bg-muted overflow-hidden">
          <img
            src={photoUrl}
            alt={revealedPlace.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target.src !== fallbackImage) {
                target.src = fallbackImage;
              }
            }}
          />
          
          {/* Overlay: Name */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
            <h4 className="text-xs font-semibold text-white line-clamp-1">
              {revealedPlace.name}
            </h4>
          </div>
        </div>

        {/* Info: Rating + Distance */}
        <div className="p-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <div className="flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
              <span>{revealedPlace.rating.toFixed(1)}</span>
            </div>
            {revealedPlace.distance_miles !== undefined && (
              <>
                <span>·</span>
                <div className="flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  <span>{revealedPlace.distance_miles.toFixed(1)} mi</span>
                </div>
              </>
            )}
          </div>
        </div>
      </a>
    );
  }

  // Blind box unrevealed state
  return (
    <button
      onClick={handleClick}
      disabled={isRolling || randomPool.length === 0}
      className="block w-44 rounded-lg overflow-hidden bg-card/50 border border-border/50 hover:border-primary/50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {/* Blind Box Image/Icon */}
      <div className="relative w-full h-32 bg-gradient-to-br from-primary/20 to-primary/5 overflow-hidden flex items-center justify-center">
        {isRolling ? (
          // Dice animation - cycle through dice faces
          <DiceAnimation />
        ) : (
          // Static dice icon
          <Dice6 className="w-12 h-12 text-primary/70" />
        )}
        
        {/* Overlay: Title */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
          <h4 className="text-xs font-semibold text-white">
            {isRolling ? '摇骰子中...' : '盲盒'}
          </h4>
          {!isRolling && (
            <p className="text-[10px] text-white/70 mt-0.5">随机选店</p>
          )}
        </div>
      </div>

      {/* Info placeholder */}
      <div className="p-2">
        <div className="text-xs text-muted-foreground font-mono">
          {isRolling ? '...' : '点击开启'}
        </div>
      </div>
    </button>
  );
}
