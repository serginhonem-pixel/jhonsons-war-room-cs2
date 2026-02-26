#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

TICK_RATE = 64.0


def i(v, d=0):
    try:
        return int(v)
    except Exception:
        return d


def f(v, d=0.0):
    try:
        return float(v)
    except Exception:
        return d


def norm_team(v):
    s = str(v or "").lower()
    n = i(v, -1)
    if n == 3 or "ct" in s or "counter" in s:
        return "ct"
    if n == 2 or s == "t" or "terror" in s:
        return "t"
    return "unknown"


def norm_weapon(v):
    return str(v or "").lower().replace("weapon_", "").strip()


def normalize_events(rows, event_name=None):
    if rows is None:
        return []
    if isinstance(rows, dict):
        out = []
        for k, arr in rows.items():
            if isinstance(arr, list):
                for r in arr:
                    if isinstance(r, dict):
                        rr = dict(r)
                        rr.setdefault("event_name", k)
                        out.append(rr)
        return out
    if isinstance(rows, list):
        out = []
        for r in rows:
            if isinstance(r, dict):
                rr = dict(r)
                if event_name and "event_name" not in rr:
                    rr["event_name"] = event_name
                out.append(rr)
        return out
    return []


def v3(row):
    x = row.get("CCSPlayerPawn.m_vecX") if row else None
    y = row.get("CCSPlayerPawn.m_vecY") if row else None
    z = row.get("CCSPlayerPawn.m_vecZ") if row else None
    if x is None or y is None or z is None:
        return None
    try:
        return float(x), float(y), float(z)
    except Exception:
        return None


def distance(a, b):
    if not a or not b:
        return None
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


class ParserAdapter:
    def __init__(self, demo_path: str):
        self.demo_path = str(demo_path)
        self.buffer = Path(demo_path).read_bytes()
        try:
            import demoparser2 as d
        except Exception as exc:
            raise RuntimeError("Instale demoparser2: pip install demoparser2") from exc
        self.mod = d
        self.obj = None
        cls = getattr(d, "DemoParser", None)
        if cls:
            for arg in (self.demo_path, self.buffer):
                try:
                    self.obj = cls(arg)
                    break
                except Exception:
                    pass

    def parse_header(self):
        if self.obj and hasattr(self.obj, "parse_header"):
            try:
                return dict(self.obj.parse_header() or {})
            except Exception:
                pass
        fn = getattr(self.mod, "parse_header", None)
        if callable(fn):
            for arg in (self.buffer, self.demo_path):
                try:
                    return dict(fn(arg) or {})
                except Exception:
                    pass
        return {}

    def parse_event(self, event_name):
        if self.obj and hasattr(self.obj, "parse_event"):
            for args in ((event_name,), (event_name, [], [])):
                try:
                    return normalize_events(self.obj.parse_event(*args), event_name)
                except Exception:
                    pass
        fn = getattr(self.mod, "parse_event", None)
        if callable(fn):
            for args in (
                (self.buffer, event_name),
                (self.buffer, event_name, [], []),
                (self.demo_path, event_name),
                (self.demo_path, event_name, [], []),
            ):
                try:
                    return normalize_events(fn(*args), event_name)
                except Exception:
                    pass
        return []


def build_rounds(events):
    round_start = sorted(
        [e for e in events if str(e.get("event_name", "")).lower() == "round_start"],
        key=lambda x: i(x.get("tick")),
    )
    round_end = sorted(
        [e for e in events if str(e.get("event_name", "")).lower() == "round_end"],
        key=lambda x: i(x.get("tick")),
    )
    n = max(1, len(round_start), len(round_end))
    out = []
    for idx in range(n):
        rs = round_start[idx] if idx < len(round_start) else {}
        re = round_end[idx] if idx < len(round_end) else {}
        reason = str(re.get("reason") or re.get("win_reason") or "").lower()
        if "defus" in reason:
            win_reason = "bomb_defused"
        elif "explod" in reason:
            win_reason = "bomb_exploded"
        elif "time" in reason:
            win_reason = "time"
        else:
            win_reason = "elimination"
        out.append(
            {
                "round_number": idx + 1,
                "start_tick": i(rs.get("tick"), 0),
                "end_tick": i(re.get("tick"), 0),
                "winner": norm_team(re.get("winner") or re.get("winner_team")),
                "win_reason": win_reason,
            }
        )
    return out


def round_of_tick(tick, rounds):
    for r in rounds:
        if r["end_tick"] > 0 and tick <= r["end_tick"]:
            return r["round_number"]
    return rounds[-1]["round_number"] if rounds else 1


def simple_state(speed, duck):
    if duck >= 0.6 and speed < 15:
        return "agachado"
    if speed < 15:
        return "parado"
    return "andando"


def aggregate_combat(target, rounds, kills, hurts):
    total_rounds = max(1, len(rounds))
    kills_total = sum(1 for k in kills if k["killer"] == target)
    deaths_total = sum(1 for k in kills if k["victim"] == target)
    assists_total = 0
    hs_total = sum(1 for k in kills if k["killer"] == target and k["headshot"])
    dmg_total = sum(
        max(0.0, f(e.get("dmg_health") or e.get("health_damage") or 0))
        for e in hurts
        if str(e.get("attacker_steamid") or e.get("attacker") or "") == target
    )
    by_round = defaultdict(list)
    for k in kills:
        by_round[round_of_tick(i(k["tick"]), rounds)].append(k)
    first_kill_rounds = sum(
        1
        for rn in range(1, total_rounds + 1)
        if by_round[rn] and sorted(by_round[rn], key=lambda x: x["tick"])[0]["killer"] == target
    )
    trade_ok, trade_opp = 0, 0
    for rn in range(1, total_rounds + 1):
        arr = sorted(by_round[rn], key=lambda x: x["tick"])
        for idx, ev in enumerate(arr):
            killer_id = ev["killer"]
            for j in range(idx + 1, len(arr)):
                nx = arr[j]
                if nx["tick"] - ev["tick"] > int(5 * TICK_RATE):
                    break
                if nx["killer"] == target and nx["victim"] == killer_id:
                    trade_ok += 1
                    break
            trade_opp += 1
    return {
        "kills_total": kills_total,
        "deaths_total": deaths_total,
        "assists_total": assists_total,
        "adr": dmg_total / total_rounds,
        "headshot_percentage": (100.0 * hs_total / kills_total) if kills_total else 0.0,
        "kill_death_ratio": (kills_total / deaths_total) if deaths_total else float(kills_total),
        "kills_per_round": kills_total / total_rounds,
        "first_kill_rate": first_kill_rounds / total_rounds,
        "trade_kill_rate": (trade_ok / trade_opp) if trade_opp else 0.0,
    }


def aggregate_aim(target, fires, hurts):
    shots = [
        e
        for e in sorted(fires, key=lambda x: i(x.get("tick")))
        if str(e.get("userid_steamid") or e.get("user_steamid") or e.get("player_steamid") or "") == target
    ]
    hits = [
        e
        for e in sorted(hurts, key=lambda x: i(x.get("tick")))
        if str(e.get("attacker_steamid") or e.get("attacker") or "") == target
    ]
    first_shots, prev = [], -10**9
    for s in shots:
        st = i(s.get("tick"))
        if st - prev > 12:
            first_shots.append(s)
        prev = st
    hit_ticks = [i(h.get("tick")) for h in hits]
    first_hit = sum(1 for s in first_shots if any(0 <= ht - i(s.get("tick")) <= 8 for ht in hit_ticks))
    deltas = [
        (i(shots[n].get("tick")) - i(shots[n - 1].get("tick"))) / TICK_RATE
        for n in range(1, len(shots))
        if i(shots[n].get("tick")) >= i(shots[n - 1].get("tick"))
    ]
    sw, hw = defaultdict(int), defaultdict(int)
    for s in shots:
        sw[norm_weapon(s.get("weapon") or s.get("weapon_name"))] += 1
    for h in hits:
        hw[norm_weapon(h.get("weapon") or h.get("weapon_name"))] += 1
    by_weapon = [
        {"weapon": w, "shots": cnt, "hits": hw.get(w, 0), "accuracy": (hw.get(w, 0) / cnt) if cnt else 0.0}
        for w, cnt in sorted(sw.items())
    ]
    # reacao aproximada: tempo entre primeira aparicao de hit no burst e o primeiro tiro do burst
    # (quando nao houver base de visibilidade suficiente, fica None)
    reaction_samples = []
    for s in first_shots:
        st = i(s.get("tick"))
        next_hit = next((ht for ht in hit_ticks if ht >= st), None)
        if next_hit is not None:
            reaction_samples.append(max(0.0, (next_hit - st) * 1000.0 / TICK_RATE))
    return {
        "first_bullet_accuracy": (first_hit / len(first_shots)) if first_shots else 0.0,
        "accuracy_geral": (len(hits) / len(shots)) if shots else 0.0,
        "tempo_medio_entre_tiros_s": (sum(deltas) / len(deltas)) if deltas else 0.0,
        "precisao_por_arma": by_weapon,
        "reaction_time_ms_avg": (sum(reaction_samples) / len(reaction_samples)) if reaction_samples else None,
        "reaction_time_samples_ms": reaction_samples,
    }


def extract_movement(target, tick_rows):
    rows = sorted([r for r in tick_rows if str(r.get("steamid") or "") == target], key=lambda x: i(x.get("tick")))
    pos_tick, heat, path = [], [], []
    for r in rows:
        tick = i(r.get("tick"))
        x = f(r.get("CCSPlayerPawn.m_vecX"))
        y = f(r.get("CCSPlayerPawn.m_vecY"))
        z = f(r.get("CCSPlayerPawn.m_vecZ"))
        yaw = f(r.get("CCSPlayerPawn.m_angEyeAngles[1]"))
        pitch = f(r.get("CCSPlayerPawn.m_angEyeAngles[0]"))
        vx = f(r.get("CCSPlayerPawn.m_vecVelocity[0]"))
        vy = f(r.get("CCSPlayerPawn.m_vecVelocity[1]"))
        speed = math.sqrt(vx * vx + vy * vy)
        duck = f(r.get("CCSPlayerPawn.m_flDuckAmount"))
        pos_tick.append(
            {
                "tick": tick,
                "x": x,
                "y": y,
                "z": z,
                "yaw": yaw,
                "pitch": pitch,
                "speed": speed,
                "state": simple_state(speed, duck),
            }
        )
        heat.append({"x": x, "y": y, "weight": 1})
        path.append({"tick": tick, "x": x, "y": y, "z": z})
    return {"position_by_tick": pos_tick, "heatmap_data": heat, "path_data": path}


def extract_utility(target, events, pos_idx):
    blind = defaultdict(list)
    for e in events:
        if str(e.get("event_name", "")).lower() == "player_blind":
            blind[i(e.get("tick"))].append(str(e.get("user_steamid") or e.get("userid") or ""))
    out = []
    for e in events:
        name = str(e.get("event_name", "")).lower()
        if name not in {"flashbang_detonate", "smokegrenade_detonate", "hegrenade_detonate", "inferno_startburn"}:
            continue
        thrower = str(e.get("userid_steamid") or e.get("user_steamid") or e.get("player_steamid") or "")
        if thrower != target:
            continue
        tick = i(e.get("tick"))
        pos = v3(pos_idx.get((tick, thrower), {}))
        if name == "flashbang_detonate":
            typ, dur = "flash", 1.5
        elif name == "smokegrenade_detonate":
            typ, dur = "smoke", 18.0
        elif name == "hegrenade_detonate":
            typ, dur = "he", 0.1
        else:
            typ, dur = "molotov", 7.0
        out.append(
            {
                "type": typ,
                "tick_throw": tick,
                "position": {"x": pos[0], "y": pos[1], "z": pos[2]} if pos else None,
                "players_affected": blind.get(tick, []),
                "effect_duration_s": dur,
            }
        )
    return {"grenades": out}


def extract_economy(target, rounds, events, tick_rows, kills):
    price = {"ak47": 2700, "m4a1": 2900, "m4a4": 3000, "awp": 4750, "deagle": 700, "famas": 2050, "galilar": 1800}
    econ = {
        r["round_number"]: {
            "round_number": r["round_number"],
            "dinheiro_inicial": None,
            "dinheiro_gasto": 0,
            "armas_compradas": [],
            "utilidades_compradas": [],
            "valor_perdido_ao_morrer": 0,
        }
        for r in rounds
    }
    acc = {(i(r.get("tick")), str(r.get("steamid") or "")): i(r.get("CCSPlayerController.m_iAccount"), -1) for r in tick_rows}
    for r in rounds:
        st = r["start_tick"]
        val = acc.get((st, target), None)
        if val is None:
            for t in range(st, st + int(2 * TICK_RATE)):
                if (t, target) in acc:
                    val = acc[(t, target)]
                    break
        econ[r["round_number"]]["dinheiro_inicial"] = val
    for e in events:
        if str(e.get("event_name", "")).lower() != "item_purchase":
            continue
        sid = str(e.get("user_steamid") or e.get("player_steamid") or e.get("steamid") or "")
        if sid != target:
            continue
        tick = i(e.get("tick"))
        rn = round_of_tick(tick, rounds)
        w = norm_weapon(e.get("weapon") or e.get("weapon_name") or e.get("item") or e.get("item_name"))
        p = price.get(w, i(e.get("price"), 0))
        econ[rn]["dinheiro_gasto"] += max(0, p)
        if w in {"flashbang", "smokegrenade", "hegrenade", "incgrenade", "molotov", "decoy"}:
            econ[rn]["utilidades_compradas"].append(w)
        else:
            econ[rn]["armas_compradas"].append(w)
    for k in kills:
        if k["victim"] == target:
            rn = round_of_tick(i(k["tick"]), rounds)
            econ[rn]["valor_perdido_ao_morrer"] += price.get(norm_weapon(k.get("weapon")), 0)
    return {"per_round": [econ[k] for k in sorted(econ.keys())]}


def run(demo, target, output):
    dp = ParserAdapter(demo)
    event_names = [
        "round_start",
        "round_end",
        "round_freeze_end",
        "player_death",
        "player_hurt",
        "weapon_fire",
        "player_blind",
        "flashbang_detonate",
        "smokegrenade_detonate",
        "hegrenade_detonate",
        "inferno_startburn",
        "bomb_planted",
        "bomb_defused",
        "bomb_exploded",
        "item_purchase",
    ]
    events = dp.parse_events(event_names)
    rounds = build_rounds(events)
    deaths = [e for e in events if str(e.get("event_name", "")).lower() == "player_death"]
    hurts = [e for e in events if str(e.get("event_name", "")).lower() == "player_hurt"]
    fires = [e for e in events if str(e.get("event_name", "")).lower() == "weapon_fire"]

    steamids = set()
    players_by_team = {}
    for e in events:
        for key in ("userid_steamid", "user_steamid", "player_steamid", "attacker_steamid", "victim_steamid", "assister_steamid", "steamid"):
            sid = str(e.get(key) or "")
            if sid:
                steamids.add(sid)
        usid = str(e.get("userid_steamid") or e.get("user_steamid") or "")
        if usid:
            players_by_team[usid] = norm_team(e.get("team_num") or e.get("user_team_num") or e.get("attacker_team_num"))
    target_sid = str(target or (sorted(steamids)[0] if steamids else ""))
    if not target_sid:
        raise RuntimeError("Nenhum jogador encontrado na demo.")

    ticks_needed = sorted({i(e.get("tick"), -1) for e in events if i(e.get("tick"), -1) >= 0})
    tick_rows = dp.parse_ticks(
        [
            "tick",
            "steamid",
            "name",
            "team_num",
            "CCSPlayerPawn.m_vecX",
            "CCSPlayerPawn.m_vecY",
            "CCSPlayerPawn.m_vecZ",
            "CCSPlayerPawn.m_angEyeAngles[0]",
            "CCSPlayerPawn.m_angEyeAngles[1]",
            "CCSPlayerPawn.m_vecVelocity[0]",
            "CCSPlayerPawn.m_vecVelocity[1]",
            "CCSPlayerPawn.m_flDuckAmount",
            "CCSPlayerController.m_iAccount",
        ],
        ticks=ticks_needed,
        players=sorted(steamids),
    )
    pos_idx = {(i(r.get("tick")), str(r.get("steamid") or "")): r for r in tick_rows if str(r.get("steamid") or "")}

    kills = []
    for e in sorted(deaths, key=lambda x: i(x.get("tick"))):
        tick = i(e.get("tick"))
        killer = str(e.get("attacker_steamid") or e.get("attacker") or "")
        victim = str(e.get("user_steamid") or e.get("victim_steamid") or e.get("userid") or "")
        kpos, vpos = v3(pos_idx.get((tick, killer), {})), v3(pos_idx.get((tick, victim), {}))
        kills.append(
            {
                "tick": tick,
                "killer": killer,
                "victim": victim,
                "weapon": norm_weapon(e.get("weapon") or e.get("weapon_name") or e.get("attacker_weapon")),
                "headshot": bool(e.get("headshot") or e.get("is_headshot")),
                "distance": distance(kpos, vpos),
                "killer_position": {"x": kpos[0], "y": kpos[1], "z": kpos[2]} if kpos else None,
                "victim_position": {"x": vpos[0], "y": vpos[1], "z": vpos[2]} if vpos else None,
                "wallbang": bool(e.get("penetrated") or e.get("is_wallbang")),
                "through_smoke": bool(e.get("thrusmoke") or e.get("through_smoke")),
                "killer_flashed": bool(e.get("attackerblind") or e.get("killer_flashed")),
            }
        )

    combat = aggregate_combat(target_sid, rounds, kills, hurts)
    aim = aggregate_aim(target_sid, fires, hurts)
    movement = extract_movement(target_sid, tick_rows)
    utility = extract_utility(target_sid, events, pos_idx)
    economy = extract_economy(target_sid, rounds, events, tick_rows, kills)

    dmg_round = defaultdict(float)
    for e in hurts:
        if str(e.get("attacker_steamid") or e.get("attacker") or "") == target_sid:
            dmg_round[round_of_tick(i(e.get("tick")), rounds)] += max(0.0, f(e.get("dmg_health") or e.get("health_damage") or 0))
    kills_round = defaultdict(list)
    for k in kills:
        kills_round[round_of_tick(i(k["tick"]), rounds)].append(k)
    rounds_out = []
    for r in rounds:
        arr = sorted(kills_round[r["round_number"]], key=lambda x: x["tick"])
        k_target = [x for x in arr if x["killer"] == target_sid]
        dead = any(x["victim"] == target_sid for x in arr)
        first = bool(arr and arr[0]["killer"] == target_sid)
        dmg = dmg_round[r["round_number"]]
        impact = len(k_target) + (0.8 if first else 0.0) + (0.5 if not dead else 0.0) + dmg / 100.0
        rounds_out.append(
            {
                "round_number": r["round_number"],
                "start_tick": r["start_tick"],
                "end_tick": r["end_tick"],
                "winner": r["winner"],
                "win_reason": r["win_reason"],
                "impact": {"kills": len(k_target), "damage": dmg, "survival": (not dead), "impact_score": impact},
            }
        )

    header = dp.parse_header()
    map_name = str(header.get("map_name") or header.get("map") or header.get("mapname") or "unknown_map")
    duration = max([r["end_tick"] for r in rounds] + [0]) / TICK_RATE
    ct_score = sum(1 for r in rounds if r["winner"] == "ct")
    t_score = sum(1 for r in rounds if r["winner"] == "t")

    output_obj = {
        "match": {
            "map": map_name,
            "duration_seconds": duration,
            "total_rounds": len(rounds),
            "result": {"ct": ct_score, "t": t_score},
            "players": sorted(steamids),
            "target_steamid": target_sid,
        },
        "player": {"steamid": target_sid, "team": players_by_team.get(target_sid, "unknown")},
        "combat": {"kills": kills, "aggregates": combat},
        "aim": aim,
        "movement": movement,
        "utility": utility,
        "economy": economy,
        "rounds": rounds_out,
    }

    out = Path(output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(output_obj, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "output": output, "map": map_name, "rounds": len(rounds), "target": target_sid}, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(description="Extrator CS2 .dem -> JSON estruturado (Python + demoparser2)")
    ap.add_argument("--demo", required=True, help="Caminho da demo .dem")
    ap.add_argument("--target-steamid", default=None, help="SteamID do jogador alvo")
    ap.add_argument("--output", required=True, help="JSON de saída")
    args = ap.parse_args()
    run(args.demo, args.target_steamid, args.output)


if __name__ == "__main__":
    main()

    def parse_events(self, event_names):
        if self.obj and hasattr(self.obj, "parse_events"):
            for args in ((event_names,), (event_names, [], [])):
                try:
                    out = normalize_events(self.obj.parse_events(*args))
                    if out:
                        return out
                except Exception:
                    pass
        fn = getattr(self.mod, "parse_events", None)
        if callable(fn):
            for args in (
                (self.buffer, event_names),
                (self.buffer, event_names, [], []),
                (self.demo_path, event_names),
                (self.demo_path, event_names, [], []),
            ):
                try:
                    out = normalize_events(fn(*args))
                    if out:
                        return out
                except Exception:
                    pass
        out = []
        for name in event_names:
            out.extend(self.parse_event(name))
        return out

    def parse_ticks(self, props, ticks=None, players=None):
        ticks = ticks or []
        players = players or []
        if self.obj and hasattr(self.obj, "parse_ticks"):
            for args in (
                (props,),
                (props, ticks),
                (props, ticks, players),
                (props, ticks, players, False, False, None),
            ):
                try:
                    return normalize_events(self.obj.parse_ticks(*args))
                except Exception:
                    pass
        fn = getattr(self.mod, "parse_ticks", None)
        if callable(fn):
            for args in (
                (self.buffer, props),
                (self.buffer, props, ticks, players),
                (self.buffer, props, ticks, players, False, False, None),
                (self.demo_path, props),
                (self.demo_path, props, ticks, players),
            ):
                try:
                    return normalize_events(fn(*args))
                except Exception:
                    pass
        return []
