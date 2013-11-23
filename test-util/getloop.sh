trap "exit" int

while true; do
  curl -v localhost:3000$1
  sleep ${2-0}
done
