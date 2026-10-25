#!/bin/bash
set -e

git add .

# Cek apakah ada perubahan yang siap di-commit
if ! git diff --cached --quiet; then
  msg="${1:-okok}"
  git commit -m "$msg"
else
  echo "Tidak ada perubahan baru untuk di-commit."
fi

# Tetap lakukan push jika ada commit lokal yang belum ter-push
git push origin main
