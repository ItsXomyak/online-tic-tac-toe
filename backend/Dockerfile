# Этап сборки
FROM golang:1.21-alpine AS builder

# Установка необходимых инструментов для сборки
RUN apk add --no-cache git

WORKDIR /app

# Копируем файлы зависимостей
COPY go.mod go.sum ./
RUN go mod download

# Копируем исходный код
COPY . .

# Собираем приложение
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd

# Финальный этап
FROM alpine:latest

WORKDIR /app

# Копируем только бинарный файл из этапа сборки
COPY --from=builder /app/main .

# Устанавливаем необходимые пакеты для работы с PostgreSQL
RUN apk add --no-cache ca-certificates tzdata

# Указываем порт, который будет использоваться
EXPOSE 8080

# Запускаем приложение
CMD ["./main"]