import os

import pytest


def test_setup_telemetry_dev_mode_returns_valid_providers():
    os.environ.pop("ENVIRONMENT", None)

    from opentelemetry import metrics, trace

    from telemetry import setup_telemetry

    setup_telemetry()

    tracer = trace.get_tracer("test.telemetry")
    meter = metrics.get_meter("test.telemetry")

    assert tracer is not None
    assert meter is not None

    with tracer.start_as_current_span("test.span") as span:
        assert span.is_recording()

    counter = meter.create_counter("test.counter")
    counter.add(1)
