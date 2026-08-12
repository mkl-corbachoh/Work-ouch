set dotenv-load := true

install:
    npm ci

dev:
    npm run dev

build:
    npm run build

start:
    npm run start

test *args:
    npm run test -- {{args}}

typecheck:
    npm run typecheck

lint:
    npm run lint

format:
    npm run format

db-migrate:
    npm run db:migrate

db-reset:
    npm run db:reset

db-seed:
    npm run db:seed

db-import:
    npm run db:import

docker-build:
    docker compose build

docker-up:
    docker compose up -d --build

docker-down:
    docker compose down

docker-logs:
    docker compose logs -f api
