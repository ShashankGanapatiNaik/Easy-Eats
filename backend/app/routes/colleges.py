from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime

from app.models.college import College
from app.models.stall import Stall
from app.utils.security import require_role, get_current_user

router = APIRouter(
    prefix="/colleges",
    tags=["Colleges"]
)

class CollegeCreateBody(BaseModel):
    name: str
    domain: str
    hotel_ids: Optional[List[str]] = []

class CollegeUpdateBody(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    hotel_ids: Optional[List[str]] = None

class AssignHotelBody(BaseModel):
    hotel_id: str

@router.get("/")
async def list_colleges():
    """List all colleges. Public route."""
    colleges = await College.find().to_list()
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "domain": c.domain,
            "hotel_ids": c.hotel_ids,
            "latitude": c.latitude,
            "longitude": c.longitude,
        }
        for c in colleges
    ]

@router.get("/{college_id}")
async def get_college(college_id: str):
    """Get college detail with populated hotels."""
    try:
        college = await College.get(ObjectId(college_id))
    except Exception:
        college = None

    if not college:
        raise HTTPException(status_code=404, detail="College not found")

    hotels = []
    if college.hotel_ids:
        for hid in college.hotel_ids:
            try:
                stall = await Stall.get(ObjectId(hid))
                if stall:
                    hotels.append({
                        "id": str(stall.id),
                        "name": stall.name,
                        "location_label": stall.location_label,
                        "hero_image_url": stall.hero_image_url,
                        "is_open": stall.is_open,
                        "avg_rating": stall.avg_rating,
                    })
            except Exception:
                pass

    return {
        "id": str(college.id),
        "name": college.name,
        "domain": college.domain,
        "hotel_ids": college.hotel_ids,
        "hotels": hotels,
    }

@router.post("/", status_code=201)
async def create_college(
    body: CollegeCreateBody,
    current_user=Depends(require_role("admin"))
):
    """Create a new college (Admin only)."""
    domain = body.domain.strip()
    if not domain.startswith("@"):
        domain = "@" + domain

    existing = await College.find_one(College.domain == domain)
    if existing:
        raise HTTPException(status_code=400, detail="A college with this domain already exists")

    college = College(
        name=body.name.strip(),
        domain=domain,
        hotel_ids=body.hotel_ids or []
    )
    await college.insert()
    return {"message": "College created successfully", "id": str(college.id)}

@router.put("/{college_id}")
async def update_college(
    college_id: str,
    body: CollegeUpdateBody,
    current_user=Depends(require_role("admin"))
):
    """Update a college (Admin only)."""
    college = await College.get(ObjectId(college_id))
    if not college:
        raise HTTPException(status_code=404, detail="College not found")

    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.domain is not None:
        d = body.domain.strip()
        if not d.startswith("@"):
            d = "@" + d
        updates["domain"] = d
    if body.hotel_ids is not None:
        updates["hotel_ids"] = body.hotel_ids

    updates["updated_at"] = datetime.utcnow()
    await college.update({"$set": updates})
    return {"message": "College updated successfully"}

@router.delete("/{college_id}")
async def delete_college(
    college_id: str,
    current_user=Depends(require_role("admin"))
):
    """Delete a college (Admin only)."""
    college = await College.get(ObjectId(college_id))
    if not college:
        raise HTTPException(status_code=404, detail="College not found")

    await college.delete()
    return {"message": "College deleted successfully"}

@router.post("/{college_id}/assign-hotel")
async def assign_hotel(
    college_id: str,
    body: AssignHotelBody,
    current_user=Depends(require_role("admin"))
):
    """Assign a hotel to a college (Admin only)."""
    college = await College.get(ObjectId(college_id))
    if not college:
        raise HTTPException(status_code=404, detail="College not found")

    stall = await Stall.get(ObjectId(body.hotel_id))
    if not stall:
        raise HTTPException(status_code=404, detail="Hotel not found")

    hid = str(stall.id)
    if hid not in college.hotel_ids:
        college.hotel_ids.append(hid)
        college.updated_at = datetime.utcnow()
        await college.save()

    return {"message": f"Hotel '{stall.name}' assigned to {college.name}"}

@router.post("/{college_id}/unassign-hotel")
async def unassign_hotel(
    college_id: str,
    body: AssignHotelBody,
    current_user=Depends(require_role("admin"))
):
    """Remove a hotel from a college (Admin only)."""
    college = await College.get(ObjectId(college_id))
    if not college:
        raise HTTPException(status_code=404, detail="College not found")

    hid = body.hotel_id
    if hid in college.hotel_ids:
        college.hotel_ids.remove(hid)
        college.updated_at = datetime.utcnow()
        await college.save()

    return {"message": "Hotel unassigned successfully"}
