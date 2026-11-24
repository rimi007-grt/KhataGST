# KhataGST Automation Makefile
.PHONY: help migrate dev test test-frontend test-backend build

help:
	@echo "Available commands:"
	@echo "  make migrate       - Run Alembic migrations and seed baseline statutory data"
	@echo "  make test          - Run both frontend and backend test suites"
	@echo "  make test-backend  - Run backend pytest suite"
	@echo "  make test-frontend - Run frontend vitest suite & contrast checks"
	@echo "  make build         - Build production frontend PWA static assets"
	@echo "  make docker-up     - Run full offline local stack via docker-compose"

migrate:
	cd backend && python scripts/migrate.py

test-backend:
	cd backend && pytest

test-frontend:
	cd frontend && npm test && npm run test:contrast

test: test-backend test-frontend

build:
	cd frontend && npm run build

docker-up:
	docker-compose up --build

