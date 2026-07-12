from fastapi import FastAPI, HTTPException
import api


app = FastAPI()
app.include_router(api.router)


@app.get("/health")
async def health():
    try:
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, {"status": "error", "error": str(e)})