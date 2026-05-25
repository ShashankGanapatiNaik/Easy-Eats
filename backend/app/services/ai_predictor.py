"""
AI Prep-Time Predictor
─────────────────────
Lightweight heuristic model retained from original Easy Eats.
Pluggable — replace with an ML model (scikit-learn / TFLite) later.
"""
from datetime import datetime


def predict_prep_time(total: float, active_orders: int) -> int:
    """
    Returns estimated prep time in minutes.
    Factors: order value, live queue depth, rush-hour detection.
    """
    base_time = 5

    # Order value factor
    if total > 300:
        base_time += 8
    elif total > 150:
        base_time += 5
    else:
        base_time += 3

    # Queue depth factor (2 min per active order, capped)
    queue_delay = min(active_orders * 2, 8)
    base_time += queue_delay

    # Kitchen capacity tier
    if active_orders <= 5:
        capacity_delay = 0
    elif active_orders <= 10:
        capacity_delay = 1
    elif active_orders <= 15:
        capacity_delay = 2
    else:
        capacity_delay = 3
    base_time += capacity_delay

    # Rush-hour bonus  (12:00–13:30 and 17:00–18:00)
    now = datetime.now()
    is_lunch_rush = (now.hour == 12) or (now.hour == 13 and now.minute <= 30)
    is_evening_rush = now.hour == 17 or (now.hour == 18 and now.minute == 0)
    if is_lunch_rush or is_evening_rush:
        base_time += 3

    return base_time
