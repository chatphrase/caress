trap "exit" int

while true; do
  curl -v ${etag:+-H "If-None-Match: $etag"} localhost:3000$1 -D >(sed -rn 's/^Etag:\s*//p' | read etag)
  if [ $? == 0 ]; then
    sleep ${2-0}
  else
    exit
  fi
done
