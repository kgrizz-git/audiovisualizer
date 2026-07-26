#!/bin/sh

mkdir -p .git/hooks

cat << 'EOF' > .git/hooks/pre-commit
#!/bin/sh
has_failed=0

staged_files=$(git diff --cached --name-only --diff-filter=ACM)
if [ -z "$staged_files" ]; then
    exit 0
fi

echo "--- Running check_file_size.py ---"
if ! python3 hooks/scripts/check_file_size.py $staged_files; then
    has_failed=1
fi

staged_md=$(echo "$staged_files" | grep -i '\.md$' || true)
if [ -n "$staged_md" ]; then
    echo "--- Running check_todo_limits.py ---"
    if ! python3 hooks/scripts/check_todo_limits.py $staged_md; then
        has_failed=1
    fi
    echo "--- Running check_doc_freshness.py ---"
    if ! python3 hooks/scripts/check_doc_freshness.py $staged_md; then
        has_failed=1
    fi
fi

if [ $has_failed -ne 0 ]; then
    exit 1
fi
exit 0
EOF
chmod +x .git/hooks/pre-commit

cat << 'EOF' > .git/hooks/pre-push
#!/bin/sh
echo "--- Running npm run validate ---"
if ! npm run validate; then
    exit 1
fi
exit 0
EOF
chmod +x .git/hooks/pre-push

echo "Hooks installed in .git/hooks/"
