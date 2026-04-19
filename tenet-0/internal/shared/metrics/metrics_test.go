package metrics

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

func TestNew_ReturnsUsableRegistry(t *testing.T) {
	r := New("bus_watcher")
	if r == nil {
		t.Fatal("New returned nil")
	}
	if r.Prom() == nil {
		t.Fatal("Prom() returned nil")
	}
}

func TestStandardMetrics_NamesMatchContractRegex(t *testing.T) {
	re := regexp.MustCompile(MetricNameRegex)
	r := New("bus_watcher")
	mfs, err := r.Prom().Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}
	if len(mfs) == 0 {
		t.Fatal("expected standard metrics auto-registered; got zero MetricFamilies")
	}
	for _, mf := range mfs {
		if !re.MatchString(mf.GetName()) {
			t.Errorf("metric %q violates regex %s", mf.GetName(), MetricNameRegex)
		}
		if !strings.HasPrefix(mf.GetName(), "tenet0_bus_watcher_") {
			t.Errorf("metric %q missing tenet0_bus_watcher_ prefix", mf.GetName())
		}
	}
}

func TestStandardMetrics_PresentByName(t *testing.T) {
	r := New("bus_watcher")
	mfs, _ := r.Prom().Gather()

	want := []string{
		"tenet0_bus_watcher_requests_total",
		"tenet0_bus_watcher_request_duration_seconds",
		"tenet0_bus_watcher_errors_total",
	}
	have := map[string]bool{}
	for _, mf := range mfs {
		have[mf.GetName()] = true
	}
	for _, w := range want {
		if !have[w] {
			t.Errorf("missing standard metric %q", w)
		}
	}
}

func TestIncRequest_IncrementsCounter(t *testing.T) {
	r := New("bus_watcher")
	r.IncRequest("ok")
	r.IncRequest("ok")
	r.IncRequest("error")

	mfs, _ := r.Prom().Gather()
	var okVal, errVal float64
	for _, mf := range mfs {
		if mf.GetName() != "tenet0_bus_watcher_requests_total" {
			continue
		}
		for _, m := range mf.GetMetric() {
			status := labelValue(m, "status")
			switch status {
			case "ok":
				okVal = m.GetCounter().GetValue()
			case "error":
				errVal = m.GetCounter().GetValue()
			}
		}
	}
	if okVal != 2 {
		t.Errorf("requests_total{status=ok} = %v, want 2", okVal)
	}
	if errVal != 1 {
		t.Errorf("requests_total{status=error} = %v, want 1", errVal)
	}
}

func TestIncError_IncrementsCounter(t *testing.T) {
	r := New("bus_watcher")
	r.IncError("timeout")

	mfs, _ := r.Prom().Gather()
	var found bool
	for _, mf := range mfs {
		if mf.GetName() != "tenet0_bus_watcher_errors_total" {
			continue
		}
		for _, m := range mf.GetMetric() {
			if labelValue(m, "type") == "timeout" && m.GetCounter().GetValue() == 1 {
				found = true
			}
		}
	}
	if !found {
		t.Error("errors_total{type=timeout} not incremented")
	}
}

func TestObserveDuration_RecordsHistogram(t *testing.T) {
	r := New("bus_watcher")
	r.ObserveDuration(150 * time.Millisecond)
	r.ObserveDuration(50 * time.Millisecond)

	mfs, _ := r.Prom().Gather()
	var sample uint64
	for _, mf := range mfs {
		if mf.GetName() != "tenet0_bus_watcher_request_duration_seconds" {
			continue
		}
		for _, m := range mf.GetMetric() {
			sample += m.GetHistogram().GetSampleCount()
		}
	}
	if sample != 2 {
		t.Errorf("histogram sample count = %d, want 2", sample)
	}
}

func TestMustRegister_DuplicateIsNoOp(t *testing.T) {
	r := New("bus_watcher")
	c := prometheus.NewCounter(prometheus.CounterOpts{
		Name: "tenet0_bus_watcher_extra_total",
		Help: "extra",
	})
	r.MustRegister(c) // first time: registers
	defer func() {
		if rec := recover(); rec != nil {
			t.Errorf("duplicate MustRegister must NOT panic; got %v", rec)
		}
	}()
	r.MustRegister(c) // second time: must be silent
}

func TestNew_RejectsBadComponentName(t *testing.T) {
	defer func() {
		if rec := recover(); rec == nil {
			t.Error("New with invalid component name (uppercase / dash) should panic or return nil registry with no metrics")
		}
	}()
	_ = New("Bad-Name")
}

// labelValue extracts the named label from a Metric. Returns "" if absent.
func labelValue(m *dto.Metric, name string) string {
	for _, lp := range m.GetLabel() {
		if lp.GetName() == name {
			return lp.GetValue()
		}
	}
	return ""
}
