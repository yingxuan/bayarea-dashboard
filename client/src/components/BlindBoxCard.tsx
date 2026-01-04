/**
 * Blind Box Card Component
 * Shows a "盲盒" card that reveals a random place on click
 */

import { useState, useEffect } from "react";
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

/**
 * Dice SVG Component
 * A realistic 3D dice with red-orange gradient and glossy finish
 */
function DiceIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Red-orange gradient for dice body */}
        <linearGradient id="diceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff6b6b" />
          <stop offset="50%" stopColor="#ff8e53" />
          <stop offset="100%" stopColor="#ffa726" />
        </linearGradient>
        {/* Lighter gradient for top face */}
        <linearGradient id="diceTopGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff8e53" />
          <stop offset="100%" stopColor="#ffa726" />
        </linearGradient>
        {/* Darker gradient for right face */}
        <linearGradient id="diceRightGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e55555" />
          <stop offset="100%" stopColor="#ff6b6b" />
        </linearGradient>
        {/* Highlight for glossy effect */}
        <linearGradient id="diceHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="30%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Shadow */}
        <filter id="diceShadow">
          <feDropShadow dx="3" dy="3" stdDeviation="4" floodOpacity="0.3"/>
        </filter>
      </defs>
      
      {/* Right face (darker) */}
      <polygon 
        points="75,15 90,8 90,75 75,82" 
        fill="url(#diceRightGradient)" 
        opacity="0.9"
      />
      
      {/* Top face (lighter) */}
      <polygon 
        points="15,15 30,8 90,8 75,15" 
        fill="url(#diceTopGradient)" 
      />
      
      {/* Front face (main) */}
      <rect 
        x="15" 
        y="15" 
        width="60" 
        height="67" 
        rx="8" 
        fill="url(#diceGradient)" 
        filter="url(#diceShadow)"
      />
      
      {/* Glossy highlight on front face */}
      <rect 
        x="15" 
        y="15" 
        width="60" 
        height="67" 
        rx="8" 
        fill="url(#diceHighlight)" 
      />
      
      {/* Dots (pips) - white oval shapes */}
      {/* Top face: 1 dot (center) */}
      <ellipse cx="52.5" cy="11.5" rx="4" ry="5" fill="white" opacity="0.95" />
      
      {/* Front face: 2 dots (diagonal) */}
      <ellipse cx="30" cy="35" rx="4" ry="5" fill="white" opacity="0.95" />
      <ellipse cx="60" cy="62" rx="4" ry="5" fill="white" opacity="0.95" />
      
      {/* Right face: 3 dots (diagonal) */}
      <ellipse cx="80" cy="25" rx="3.5" ry="4.5" fill="white" opacity="0.9" />
      <ellipse cx="85" cy="45" rx="3.5" ry="4.5" fill="white" opacity="0.9" />
      <ellipse cx="82" cy="65" rx="3.5" ry="4.5" fill="white" opacity="0.9" />
    </svg>
  );
}

/**
 * Dice Animation Component
 * Animated dice with rotation
 */
function DiceAnimation() {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => (prev + 20) % 360);
    }, 100);

    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="animate-bounce">
      <div style={{ transform: `rotate(${rotation}deg)` }}>
        <DiceIcon className="w-14 h-14 text-primary" />
      </div>
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
            <h4 className="text-[13px] font-medium text-white mb-0.5 line-clamp-1 leading-tight">
              {revealedPlace.name}
            </h4>
          </div>
        </div>

        {/* Info: Rating + Distance */}
        <div className="p-2">
          <div className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground font-mono font-normal">
            <div className="flex items-baseline gap-0.5">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />
              <span className="tabular-nums">{revealedPlace.rating.toFixed(1)}</span>
            </div>
            {revealedPlace.distance_miles !== undefined && (
              <>
                <span>•</span>
                <div className="flex items-baseline gap-0.5">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="tabular-nums">{revealedPlace.distance_miles.toFixed(1)} mi</span>
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
      className="block w-44 rounded-lg bg-card/50 border border-border/50 hover:border-primary/50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed flex flex-col"
    >
      {/* Dice Image/Icon - 确保完整显示，不裁切 */}
      <div className="relative w-full h-32 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center" style={{ minHeight: '128px' }}>
        {isRolling ? (
          // Dice animation with rotation
          <DiceAnimation />
        ) : (
          // Static dice icon
          <DiceIcon className="w-14 h-14 text-primary/70" />
        )}
        
        {/* Overlay: Title */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
          {isRolling && (
            <h4 className="text-[13px] font-medium text-white leading-tight">
              摇色子中...
            </h4>
          )}
          {!isRolling && (
            <p className="text-[11px] text-white/70 font-mono font-normal">随机选店</p>
          )}
        </div>
      </div>

      {/* Info placeholder */}
      <div className="p-2 flex-shrink-0">
        <div className="text-[11px] text-muted-foreground font-mono font-normal">
          {isRolling ? '...' : ''}
        </div>
      </div>
    </button>
  );
}
