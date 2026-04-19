// Package metrics wraps prometheus.Registry with the standard Tenet-0
// histograms and counters every binary exposes via /metrics. Names follow
// `^tenet0_[a-z][a-z0-9_]*$` per contracts/daemon-health-contracts.yaml.
package metrics

import (
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// MetricNameRegex is the validation pattern from
// contracts/daemon-health-contracts.yaml. Exposed for tests and for
// callers registering ad-hoc metrics.
const MetricNameRegex = `^tenet0_[a-z][a-z0-9_]*$`

var componentRegex = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

// Registry bundles a *prometheus.Registry with the auto-registered
// standard metrics for one component.
type Registry struct {
	reg      *prometheus.Registry
	requests *prometheus.CounterVec
	errors   *prometheus.CounterVec
	duration prometheus.Histogram
}

// New constructs a Registry for the named component. component MUST match
// `[a-z][a-z0-9_]*`; the implementation prefixes it with `tenet0_` for
// every standard metric. Panics on invalid component names — misconfig at
// startup is preferable to silently mis-named metrics.
func New(component string) *Registry {
	if !componentRegex.MatchString(component) {
		panic(fmt.Sprintf("metrics.New: component %q must match %s", component, componentRegex))
	}
	prefix := "tenet0_" + component + "_"
	reg := prometheus.NewRegistry()

	requests := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: prefix + "requests_total",
		Help: "Total requests handled by " + component,
	}, []string{"status"})

	errs := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: prefix + "errors_total",
		Help: "Total errors raised by " + component,
	}, []string{"type"})

	dur := prometheus.NewHistogram(prometheus.HistogramOpts{
		Name:    prefix + "request_duration_seconds",
		Help:    "Request duration histogram for " + component,
		Buckets: prometheus.DefBuckets,
	})

	reg.MustRegister(requests, errs, dur)

	// Pre-warm CounterVec series so Gather() reports the metric families
	// even before the first IncRequest/IncError. Prometheus omits empty
	// CounterVecs from Gather output.
	requests.WithLabelValues("ok").Add(0)
	errs.WithLabelValues("none").Add(0)

	return &Registry{
		reg:      reg,
		requests: requests,
		errors:   errs,
		duration: dur,
	}
}

// Prom returns the underlying *prometheus.Registry so the HTTP handler can
// expose it via promhttp.HandlerFor.
func (r *Registry) Prom() *prometheus.Registry { return r.reg }

// IncRequest bumps tenet0_<component>_requests_total{status=...}.
func (r *Registry) IncRequest(status string) {
	r.requests.WithLabelValues(status).Inc()
}

// IncError bumps tenet0_<component>_errors_total{type=...}.
func (r *Registry) IncError(errType string) {
	r.errors.WithLabelValues(errType).Inc()
}

// ObserveDuration records onto tenet0_<component>_request_duration_seconds.
func (r *Registry) ObserveDuration(d time.Duration) {
	r.duration.Observe(d.Seconds())
}

// MustRegister registers an additional collector. Duplicate registration
// of the same collector is a no-op (NOT a panic).
func (r *Registry) MustRegister(c prometheus.Collector) {
	if err := r.reg.Register(c); err != nil {
		var are prometheus.AlreadyRegisteredError
		if errors.As(err, &are) {
			return
		}
		panic(err)
	}
}
