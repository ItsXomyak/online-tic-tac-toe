#!/bin/bash

if [ $# -eq 0 ]; then
    echo "Использование: \$0 \"Ваше сообщение коммита\""
    exit 1
fi

commit_message="$*"

git add .

git commit -m "$commit_message"

git push

echo "Изменения закоммичены и запушены в текущую ветку."