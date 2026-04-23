"""
Port of src/lib/scheduling-engine.ts.

Given busy blocks + user preferences + a target duration, finds up to N
time slots with highest scores. Pure function — no I/O, no DB.
"""
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo


@dataclass
class BlackoutTime:
    day: int  # 0-6 for Sun-Sat, -1 for every day
    start: str  # "HH:MM"
    end: str  # "HH:MM"


@dataclass
class UserPreferences:
    workDays: list[int]
    workStart: str  # "HH:MM"
    workEnd: str  # "HH:MM"
    bufferMinutes: int
    blackoutTimes: list[BlackoutTime]
    preferredSlotMinutes: int
    timezone: str
    autoReschedule: bool


@dataclass
class BusyBlock:
    start: datetime
    end: datetime


@dataclass
class ScoredSlot:
    start: datetime
    end: datetime
    score: int
    reasons: list[str] = field(default_factory=list)


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _parse_hhmm(s: str) -> tuple[int, int]:
    h, m = s.split(":")
    return int(h), int(m)


def _apply_hhmm(base: datetime, hhmm: str) -> datetime:
    h, m = _parse_hhmm(hhmm)
    return base.replace(hour=h, minute=m, second=0, microsecond=0)


def _overlaps(slot_start, slot_end, block_start, block_end) -> bool:
    return slot_start < block_end and slot_end > block_start


def _start_of_day(d: datetime) -> datetime:
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def _get_day_of_week(d: datetime) -> int:
    """Match JS getDay(): 0=Sun ... 6=Sat."""
    # Python weekday(): 0=Mon ... 6=Sun
    return (d.weekday() + 1) % 7


# ─── Public API ──────────────────────────────────────────────────────────────


def find_best_slots(
    busy_blocks: list[BusyBlock],
    prefs: UserPreferences,
    duration_minutes: int,
    days_ahead: int = 14,
    top_n: int = 3,
) -> list[ScoredSlot]:
    tz = ZoneInfo(prefs.timezone) if prefs.timezone else ZoneInfo("UTC")
    now_utc = datetime.now(timezone.utc)
    now = now_utc.astimezone(tz)
    buffer = prefs.bufferMinutes

    # Expand busy blocks with buffer on both sides.
    expanded: list[BusyBlock] = []
    for b in busy_blocks:
        b_start = b.start if b.start.tzinfo else b.start.replace(tzinfo=timezone.utc)
        b_end = b.end if b.end.tzinfo else b.end.replace(tzinfo=timezone.utc)
        expanded.append(
            BusyBlock(
                start=b_start.astimezone(tz) - timedelta(minutes=buffer),
                end=b_end.astimezone(tz) + timedelta(minutes=buffer),
            )
        )

    candidates: list[ScoredSlot] = []

    for day_offset in range(days_ahead):
        day_zoned = _start_of_day(now) + timedelta(days=day_offset)
        dow = _get_day_of_week(day_zoned)

        if dow not in prefs.workDays:
            continue

        work_start = _apply_hhmm(day_zoned, prefs.workStart)
        work_end = _apply_hhmm(day_zoned, prefs.workEnd)

        cursor = work_start
        while cursor + timedelta(minutes=duration_minutes) <= work_end:
            slot_start = cursor
            slot_end = cursor + timedelta(minutes=duration_minutes)

            # Skip past slots.
            if slot_end <= now:
                cursor += timedelta(minutes=30)
                continue

            # Blackout check.
            blocked_by_blackout = False
            for bo in prefs.blackoutTimes:
                if bo.day != -1 and bo.day != dow:
                    continue
                bo_start = _apply_hhmm(day_zoned, bo.start)
                bo_end = _apply_hhmm(day_zoned, bo.end)
                if _overlaps(slot_start, slot_end, bo_start, bo_end):
                    blocked_by_blackout = True
                    break
            if blocked_by_blackout:
                cursor += timedelta(minutes=30)
                continue

            # Busy check.
            is_busy = any(
                _overlaps(slot_start, slot_end, b.start, b.end) for b in expanded
            )
            if not is_busy:
                candidates.append(
                    _score_slot(slot_start, slot_end, expanded, prefs, day_zoned)
                )

            cursor += timedelta(minutes=30)

    # Sort by score desc, dedupe per hour, return top N.
    candidates.sort(key=lambda s: s.score, reverse=True)
    deduped: list[ScoredSlot] = []
    used_hours: set[str] = set()
    for slot in candidates:
        hour_key = slot.start.isoformat()[:13]
        if hour_key in used_hours:
            continue
        used_hours.add(hour_key)
        deduped.append(slot)
        if len(deduped) >= top_n:
            break
    return deduped


def _score_slot(
    start: datetime,
    end: datetime,
    busy_blocks: list[BusyBlock],
    prefs: UserPreferences,
    day_base: datetime,
) -> ScoredSlot:
    score = 50.0
    reasons: list[str] = []

    start_hour = start.hour + start.minute / 60
    work_start_h, _ = _parse_hhmm(prefs.workStart)
    work_end_h, _ = _parse_hhmm(prefs.workEnd)
    midday = (work_start_h + work_end_h) / 2

    if midday <= start_hour < midday + 2:
        score += 20
        reasons.append("Preferred afternoon window")

    if start_hour < work_start_h + 1:
        score -= 10
        reasons.append("Early morning — less preferred")
    if start_hour > work_end_h - 1.5:
        score -= 15
        reasons.append("End of day — less preferred")

    day_start = _start_of_day(day_base)
    day_end = day_start + timedelta(days=1)
    meetings_today = sum(
        1 for b in busy_blocks if b.start > day_start and b.end < day_end
    )
    if meetings_today == 0:
        score += 15
        reasons.append("Light day — no other meetings")
    elif meetings_today == 1:
        score += 8
        reasons.append("Only one other meeting today")
    elif meetings_today >= 4:
        score -= 20
        reasons.append("Heavy meeting day")

    # Distance to nearest busy block in minutes.
    nearest: Optional[float] = None
    for b in busy_blocks:
        before = (start - b.end).total_seconds() / 60
        after = (b.start - end).total_seconds() / 60
        gap = max(before, after, 0)
        if gap > 0:
            nearest = gap if nearest is None else min(nearest, gap)
    if nearest is not None and nearest > prefs.bufferMinutes * 2:
        score += 10
        reasons.append("Well-spaced from other meetings")

    # Tiebreak: earlier in the day wins slightly.
    score -= start_hour * 0.5

    if not reasons:
        reasons.append("Available slot")

    return ScoredSlot(start=start, end=end, score=round(score), reasons=reasons)
