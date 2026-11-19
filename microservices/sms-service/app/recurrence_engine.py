from __future__ import annotations

from statistics import median
from typing import Optional


def detect_interval_frequency(intervals: list[int]) -> Optional[tuple[str, int]]:
    """Classify a list of day gaps without reading or writing ledger data."""
    if len(intervals) < 3 or any(days <= 0 for days in intervals):
        return None

    center = median(intervals)
    if 5 <= center <= 9:
        frequency, tolerance = "weekly", 2
    elif 26 <= center <= 35:
        frequency, tolerance = "monthly", 5
    elif 350 <= center <= 380:
        frequency, tolerance = "yearly", 30
    else:
        return None

    if sum(abs(days - center) <= tolerance for days in intervals) < len(intervals) * 0.75:
        return None
    return frequency, round(center)
