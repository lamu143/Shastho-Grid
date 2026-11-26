"""API router modules."""

from app.routers.admin import router as admin_router
from app.routers.analytics import router as analytics_router
from app.routers.auth import router as auth_router
from app.routers.dispenses import router as dispenses_router
from app.routers.inventory import router as inventory_router
from app.routers.optimize import router as optimize_router
from app.routers.patients import router as patients_router
from app.routers.sync import router as sync_router
from app.routers.voice import router as voice_router

__all__ = [
    "admin_router",
    "analytics_router",
    "auth_router",
    "dispenses_router",
    "inventory_router",
    "optimize_router",
    "patients_router",
    "sync_router",
    "voice_router",
]
