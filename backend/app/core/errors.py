from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        details: dict[str, Any] | None = None,
        extra_top_level: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or {}
        self.extra_top_level = extra_top_level or {}
        super().__init__(message)


class UnauthorizedError(AppError):
    def __init__(
        self,
        message: str = "Authentication required.",
        error_code: str = "UNAUTHORIZED",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(status_code=401, error_code=error_code, message=message, details=details)


class ForbiddenError(AppError):
    def __init__(
        self,
        message: str = "You do not have permission to perform this action.",
        error_code: str = "FORBIDDEN",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(status_code=403, error_code=error_code, message=message, details=details)


class NotFoundError(AppError):
    def __init__(
        self,
        message: str = "Requested resource was not found.",
        error_code: str = "NOT_FOUND",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(status_code=404, error_code=error_code, message=message, details=details)


class ConflictError(AppError):
    def __init__(
        self,
        message: str = "Resource conflict detected.",
        error_code: str = "CONFLICT",
        details: dict[str, Any] | None = None,
        extra_top_level: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            status_code=409,
            error_code=error_code,
            message=message,
            details=details,
            extra_top_level=extra_top_level,
        )


class ValidationAppError(AppError):
    def __init__(
        self,
        message: str = "Validation failed.",
        error_code: str = "VALIDATION_ERROR",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(status_code=422, error_code=error_code, message=message, details=details)


def get_trace_id(request: Request) -> str:
    trace_id = getattr(request.state, "trace_id", None)
    if trace_id:
        return str(trace_id)
    header_trace_id = request.headers.get("X-Trace-Id")
    if header_trace_id:
        return header_trace_id
    generated = str(uuid.uuid4())
    request.state.trace_id = generated
    return generated


def build_error_payload(
    error_code: str,
    message: str,
    details: dict[str, Any] | None,
    trace_id: str,
    extra_top_level: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "error_code": error_code,
        "message": message,
        "details": jsonable_encoder(details or {}),
        "trace_id": trace_id,
    }
    if extra_top_level:
        payload.update(jsonable_encoder(extra_top_level))
    return payload


_STATUS_TO_ERROR_CODE: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMIT_EXCEEDED",
}


def _extract_pgcode(exc: IntegrityError) -> str | None:
    for candidate in (exc.orig, getattr(exc.orig, "__cause__", None)):
        if candidate is None:
            continue
        code = getattr(candidate, "pgcode", None) or getattr(candidate, "sqlstate", None)
        if code:
            return str(code)
    return None


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        trace_id = get_trace_id(request)
        return JSONResponse(
            status_code=exc.status_code,
            content=build_error_payload(
                error_code=exc.error_code,
                message=exc.message,
                details=exc.details,
                trace_id=trace_id,
                extra_top_level=exc.extra_top_level,
            ),
            headers={"X-Trace-Id": trace_id},
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        trace_id = get_trace_id(request)
        error_code = _STATUS_TO_ERROR_CODE.get(exc.status_code, "HTTP_ERROR")
        message = str(exc.detail) if exc.detail else "HTTP error"
        details: dict[str, Any] = {}
        if isinstance(exc.detail, dict):
            error_code = str(exc.detail.get("error_code", error_code))
            message = str(exc.detail.get("message", "HTTP error"))
            raw_details = exc.detail.get("details")
            if isinstance(raw_details, dict):
                details = raw_details
        return JSONResponse(
            status_code=exc.status_code,
            content=build_error_payload(
                error_code=error_code,
                message=message,
                details=details,
                trace_id=trace_id,
            ),
            headers={"X-Trace-Id": trace_id, **(exc.headers or {})},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        trace_id = get_trace_id(request)
        sanitized = [{k: v for k, v in err.items() if k != "input"} for err in exc.errors()]
        return JSONResponse(
            status_code=422,
            content=build_error_payload(
                error_code="VALIDATION_ERROR",
                message="Request validation failed.",
                details={"errors": jsonable_encoder(sanitized)},
                trace_id=trace_id,
            ),
            headers={"X-Trace-Id": trace_id},
        )

    @app.exception_handler(IntegrityError)
    async def handle_integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
        trace_id = get_trace_id(request)
        if _extract_pgcode(exc) == "23505":
            logger.warning("Unique constraint conflict trace_id=%s path=%s", trace_id, request.url.path)
            return JSONResponse(
                status_code=409,
                content=build_error_payload(
                    error_code="CONFLICT",
                    message="Resource already exists or violates a uniqueness constraint.",
                    details={},
                    trace_id=trace_id,
                ),
                headers={"X-Trace-Id": trace_id},
            )
        logger.exception("Database integrity error trace_id=%s path=%s", trace_id, request.url.path, exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=build_error_payload(
                error_code="INTERNAL_SERVER_ERROR",
                message="An unexpected internal error occurred.",
                details={},
                trace_id=trace_id,
            ),
            headers={"X-Trace-Id": trace_id},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        trace_id = get_trace_id(request)
        logger.exception("Unhandled exception trace_id=%s path=%s", trace_id, request.url.path, exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=build_error_payload(
                error_code="INTERNAL_SERVER_ERROR",
                message="An unexpected internal error occurred.",
                details={},
                trace_id=trace_id,
            ),
            headers={"X-Trace-Id": trace_id},
        )
