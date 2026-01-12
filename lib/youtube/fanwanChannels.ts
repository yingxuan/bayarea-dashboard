export type FanwanChannel = {
  handle: string;
  channelId?: string; // may be resolved at runtime if missing
};

// Known handles; channelId will be resolved via HTML if not provided
export const FANWAN_CHANNELS: FanwanChannel[] = [
  { handle: "@bestpartners" },
  { handle: "@TheValley101" },
  { handle: "@valley101podcast" },
  { handle: "@王路飞" },
  { handle: "@太学TAIXUE" },
  { handle: "@peterdiamandis" },
  { handle: "@DwarkeshPatel" },
];
