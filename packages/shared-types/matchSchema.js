import { z } from 'zod'

const playerStatsSchema = z.object({
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
  adr: z.number(),
  hs_percent: z.number(),
  rating_2: z.number(),
  kast: z.number(),
  entry_kills: z.number().optional(),
  entry_deaths: z.number().optional(),
})

const playerSchema = z.object({
  steam_id: z.string(),
  nick: z.string(),
  team: z.string(),
  stats: playerStatsSchema,
})

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  place: z.string().optional(),
})

const killEventSchema = z.object({
  t_s: z.number(),
  tick: z.number(),
  event: z.literal('kill'),
  killer_steamid: z.string(),
  victim_steamid: z.string(),
  killer_team: z.string(),
  victim_team: z.string(),
  trade_of: z.string().nullable().optional(),
  trade_delta_s: z.number().nullable().optional(),
  headshot: z.boolean().optional(),
  weapon: z.string().optional(),
  killer_position: positionSchema.optional(),
  victim_position: positionSchema.optional(),
})

const roundEventSchema = z.object({
  t_s: z.number(),
  tick: z.number(),
  event: z.enum(['purchase', 'pickup', 'drop', 'bomb_planted', 'bomb_defused', 'bomb_exploded']),
  player_steamid: z.string().optional(),
  player_team: z.string().optional(),
  weapon: z.string().optional(),
  position: positionSchema.optional(),
})

const economySideSchema = z.object({
  equipment_value: z.number(),
  cash_spent: z.number(),
  buy_tier: z.string(),
})

const roundSchema = z.object({
  round_number: z.number(),
  start_tick: z.number().optional(),
  end_tick: z.number().optional(),
  winner: z.string(),
  win_reason: z.string(),
  state_transitions: z.array(z.string()),
  opening_advantage_team_id: z.string().nullable(),
  timeline: z.array(z.union([killEventSchema, roundEventSchema])),
  economy: z.object({
    team_ct_start: economySideSchema,
    team_t_start: economySideSchema,
  }),
})

export const matchSchema = z.object({
  match_id: z.string().optional(),
  meta: z.object({
    map: z.string(),
    played_at: z.string(),
    rounds_total: z.number(),
    final_score: z.object({ ct: z.number(), t: z.number() }),
    starting_side: z.string(),
    source_file: z.string().optional(),
  }),
  players: z.array(playerSchema),
  rounds: z.array(roundSchema),
  raw_events_count: z.number().optional(),
})
