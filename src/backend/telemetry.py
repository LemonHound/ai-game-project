import logging
import os

from opentelemetry import trace, metrics
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader, ConsoleMetricExporter


def setup_telemetry() -> None:
    """Configure OpenTelemetry tracing and metrics for the application.

    In production (ENVIRONMENT=production) exports to GCP Cloud Trace and Cloud Monitoring
    using CloudTraceFormatPropagator for trace context propagation. In all other environments
    exports to stdout via ConsoleSpanExporter and ConsoleMetricExporter. Also configures
    the root logging handler at INFO level.
    """
    resource = Resource.create({
        "service.name": "ai-game-hub",
        "service.version": os.getenv("SERVICE_VERSION", "1.0.0"),
        "deployment.environment": os.getenv("ENVIRONMENT", "development"),
    })

    if os.getenv("ENVIRONMENT") == "production":
        from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
        from opentelemetry.exporter.cloud_monitoring import CloudMonitoringMetricsExporter
        from opentelemetry.propagators.cloud_trace_format import CloudTraceFormatPropagator
        from opentelemetry.propagate import set_global_textmap

        span_exporter = CloudTraceSpanExporter()
        metric_exporter = CloudMonitoringMetricsExporter()
        set_global_textmap(CloudTraceFormatPropagator())
    else:
        span_exporter = ConsoleSpanExporter()
        metric_exporter = ConsoleMetricExporter()

    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter))
    trace.set_tracer_provider(tracer_provider)

    metric_reader = PeriodicExportingMetricReader(metric_exporter)
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
