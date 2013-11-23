trap "exit" int

while true; do
  curl -v localhost:3000$1
  if [ $? == 0 ]; then
    sleep ${2-0}
  else
    exit
  fi
done
