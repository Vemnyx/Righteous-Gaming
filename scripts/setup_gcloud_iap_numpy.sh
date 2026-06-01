#!/usr/bin/env bash
# Install NumPy into the Python used by gcloud so IAP TCP forwarding (ssh/scp) uploads faster.
# https://cloud.google.com/iap/docs/using-tcp-forwarding#increasing_the_tcp_upload_bandwidth
set -euo pipefail

if ! command -v gcloud >/dev/null 2>&1; then
  echo "setup_gcloud_iap_numpy: gcloud not found in PATH" >&2
  exit 1
fi

GCLOUD_PYTHON="$(gcloud info --format='value(basic.python_location)')"
if [[ -z "${GCLOUD_PYTHON}" || ! -x "${GCLOUD_PYTHON}" ]]; then
  echo "setup_gcloud_iap_numpy: could not resolve gcloud Python" >&2
  exit 1
fi

"${GCLOUD_PYTHON}" -m pip install --disable-pip-version-check 'numpy>=2.0.0,<3'

# Allow gcloud to load site-packages (NumPy) from that interpreter.
if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "CLOUDSDK_PYTHON_SITEPACKAGES=1" >>"${GITHUB_ENV}"
else
  echo "setup_gcloud_iap_numpy: set CLOUDSDK_PYTHON_SITEPACKAGES=1 in your shell for faster IAP uploads" >&2
  echo "  export CLOUDSDK_PYTHON_SITEPACKAGES=1" >&2
fi
