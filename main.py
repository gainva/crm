import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models
from routers import auth_router, employees, customers, reports, platform, files_router, invitations

models.Base.metadata.create_all(bind=engine)
os.makedirs("uploads/reports", exist_ok=True)
os.makedirs("uploads/templates", exist_ok=True)

app = FastAPI(title="中村留 代理商报备系统", version="2.0.0", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(employees.router, prefix="/api/employees", tags=["employees"])
app.include_router(customers.router, prefix="/api/customers", tags=["customers"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(platform.router, prefix="/api/platform", tags=["platform"])
app.include_router(files_router.router, prefix="/api/files", tags=["files"])
app.include_router(invitations.router, prefix="/api/invitations", tags=["invitations"])

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    if full_path.startswith("api/"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    return FileResponse("static/index.html")
