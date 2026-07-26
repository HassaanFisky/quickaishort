"""Patch adk_generate refund wrap — delete after use."""
from pathlib import Path

p = Path(__file__).with_name("main.py")
text = p.read_text(encoding="utf-8")
crlf = "\r\n" in text


def nl(s: str) -> str:
    return s.replace("\n", "\r\n") if crlf else s


old = '''    if not await deduct_credits(user_id, 50):
        raise HTTPException(
            status_code=402,
            detail="Insufficient credits for ADK generate (50 required).",
        )

    from services.adk_service import ADKService

    plan = await ADKService.generate_production_plan(
        script=body.script,
        voice_id=body.voice_id,
        uploaded_file_ids=body.uploaded_file_ids,
        user_id=user_id,
        stock_query=body.stock_query,
        aspect_ratio=body.aspect_ratio,
    )

    job_id = uuid.uuid4().hex
    project_svc = get_project_service()
    project_id = await project_svc.create_project(
        user_id,
        f"Short - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        body.script,
    )

    await project_svc.update_project(
        project_id,
        user_id,
        {
            "status": "processing",
            "job_id": job_id,
            "segments": plan["segments"],
            "voice_id": body.voice_id,
            "aspect_ratio": body.aspect_ratio,
        },
    )

    await dispatch_render_task(
        RenderTaskPayload(
            job_id=job_id,
            video_id="adk-generated",
            start_sec=0.0,
            end_sec=0.0,
            user_id=user_id,
            options={
                "production_plan": plan,
                "quality": body.quality,
                "aspect_ratio": body.aspect_ratio,
            },
        )
    )

    try:
        redis_conn.hset(
            f"render:meta:{job_id}",
            mapping={"credits_charged": "50"},
        )
    except Exception as exc:
        logger.warning("adk_credits_stamp_failed job_id=%s err=%s", job_id, exc)

    from services.stats_service import increment_stats

    try:
        await increment_stats(user_id, ai_run_delta=1)
    except Exception as exc:
        logger.warning(
            "adk_generate_stats_increment_failed job_id=%s err=%s", job_id, exc
        )
    return {
        "status": "queued",
        "job_id": job_id,
        "project_id": project_id,
        "subscribe_channel": f"export-{job_id}",
    }
'''

new = '''    if not await deduct_credits(user_id, 50):
        raise HTTPException(
            status_code=402,
            detail="Insufficient credits for ADK generate (50 required).",
        )

    from services.adk_service import ADKService
    from services.credit_guard import refund_credits_best_effort

    job_id = ""
    project_id = ""
    try:
        plan = await ADKService.generate_production_plan(
            script=body.script,
            voice_id=body.voice_id,
            uploaded_file_ids=body.uploaded_file_ids,
            user_id=user_id,
            stock_query=body.stock_query,
            aspect_ratio=body.aspect_ratio,
        )

        job_id = uuid.uuid4().hex
        project_svc = get_project_service()
        project_id = await project_svc.create_project(
            user_id,
            f"Short - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            body.script,
        )

        await project_svc.update_project(
            project_id,
            user_id,
            {
                "status": "processing",
                "job_id": job_id,
                "segments": plan["segments"],
                "voice_id": body.voice_id,
                "aspect_ratio": body.aspect_ratio,
            },
        )

        await dispatch_render_task(
            RenderTaskPayload(
                job_id=job_id,
                video_id="adk-generated",
                start_sec=0.0,
                end_sec=0.0,
                user_id=user_id,
                options={
                    "production_plan": plan,
                    "quality": body.quality,
                    "aspect_ratio": body.aspect_ratio,
                },
            )
        )
    except HTTPException:
        await refund_credits_best_effort(
            user_id, 50, reason="adk_http_fail", route="adk-generate"
        )
        raise
    except Exception as exc:
        logger.exception("adk_generate_failed user=%s", user_id)
        await refund_credits_best_effort(
            user_id, 50, reason="adk_failed", route="adk-generate"
        )
        raise HTTPException(
            status_code=503,
            detail="ADK generate failed. Credits were refunded — try again.",
        ) from exc

    try:
        redis_conn.hset(
            f"render:meta:{job_id}",
            mapping={"credits_charged": "50"},
        )
    except Exception as exc:
        logger.warning("adk_credits_stamp_failed job_id=%s err=%s", job_id, exc)

    from services.stats_service import increment_stats

    try:
        await increment_stats(user_id, ai_run_delta=1)
    except Exception as exc:
        logger.warning(
            "adk_generate_stats_increment_failed job_id=%s err=%s", job_id, exc
        )
    return {
        "status": "queued",
        "job_id": job_id,
        "project_id": project_id,
        "subscribe_channel": f"export-{job_id}",
    }
'''

if "adk_generate_failed user=%s" in text:
    print("already patched")
elif nl(old) in text:
    text = text.replace(nl(old), nl(new), 1)
    print("OK crlf")
elif old in text:
    text = text.replace(old, new, 1)
    print("OK lf")
else:
    print("FAIL")
    raise SystemExit(1)

tmp = p.with_suffix(".py.qcraft2")
tmp.write_text(text, encoding="utf-8", newline="")
tmp.replace(p)
print("done")
