<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Админ-панель токенов</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
        th { background-color: #f2f2f2; }
        .active { background-color: #d4edda; }
    </style>
</head>
<body>
    <h2>Админ-панель токенов</h2>

    <h3>Генерация нового токена</h3>
    <label for="plan">Тариф:</label>
    <select id="plan">
        <option value="day">На день</option>
        <option value="monthly">На месяц</option>
        <option value="halfyear">На 6 месяцев</option>
        <option value="yearly">На год</option>
    </select>
    <label for="agent">Агент:</label>
    <select id="agent">
        <option value="lawyer">Адвокат Человек</option>
        <option value="zheka">ЖЭКА</option>
        <option value="bankshield">БанкЩит</option>
    </select>
    <button onclick="generateToken()">Сгенерировать</button>
    <p id="newTokenResult"></p>

    <h3>Проверка токена</h3>
    <input type="text" id="checkTokenInput" placeholder="Введите токен">
    <select id="checkAgent">
        <option value="lawyer">Адвокат Человек</option>
        <option value="zheka">ЖЭКА</option>
        <option value="bankshield">БанкЩит</option>
    </select>
    <button onclick="checkToken()">Проверить</button>
    <p id="checkResult"></p>

    <h3>Список всех токенов</h3>
    <label for="filter">Фильтр:</label>
    <select id="filter">
        <option value="">Все</option>
        <option value="active">Активные</option>
        <option value="expired">Истёкшие</option>
    </select>
    <select id="filterAgent">
        <option value="">Все агенты</option>
        <option value="lawyer">Адвокат Человек</option>
        <option value="zheka">ЖЭКА</option>
        <option value="bankshield">БанкЩит</option>
    </select>
    <button onclick="loadTokens()">Обновить</button>
    <table>
        <thead>
            <tr><th>Токен</th><th>Тариф</th><th>Агент</th><th>Истекает</th><th>Статус</th><th>Удалить</th></tr>
        </thead>
        <tbody id="tokenTable"></tbody>
    </table>

    <script>
        async function generateToken() {
            const plan = document.getElementById("plan").value;
            const agent = document.getElementById("agent").value;
            const res = await fetch(`/generate-token?plan=${plan}&agent=${agent}`);
            const data = await res.json();
            document.getElementById("newTokenResult").textContent = data.success ? `Создан токен: ${data.token}, тариф: ${data.plan}, агент: ${data.agent}, истекает: ${new Date(data.expiresAt).toLocaleString()}` : `Ошибка: ${data.message}`;
            loadTokens();
        }

        async function checkToken() {
            const token = document.getElementById("checkTokenInput").value;
            const agent = document.getElementById("checkAgent").value;
            const res = await fetch(`/check-token?token=${token}&agent=${agent}`);
            const data = await res.json();
            document.getElementById("checkResult").textContent = data.valid ? `Токен действителен. План: ${data.plan}, агент: ${data.agent}, истекает: ${data.expiresAt}` : `Ошибка: ${data.message}`;
        }

        async function loadTokens() {
            const filter = document.getElementById("filter").value;
            const agent = document.getElementById("filterAgent").value;
            let url = `/tokens`;
            const params = [];
            if (filter) params.push(`filter=${filter}`);
            if (agent) params.push(`agent=${agent}`);
            if (params.length > 0) url += `?${params.join('&')}`;
            const res = await fetch(url);
            const tokens = await res.json();
            const tbody = document.getElementById("tokenTable");
            tbody.innerHTML = "";
            tokens.forEach(t => {
                const tr = document.createElement("tr");
                tr.className = t.status === "active" ? "active" : "";
                tr.innerHTML = `<td>${t.token}</td><td>${t.plan}</td><td>${t.agent}</td><td>${new Date(t.expiresAt).toLocaleString()}</td><td>${t.status === "active" ? "Активен" : "Неактивен"}</td><td><button onclick="deleteToken('${t.token}')">Удалить</button></td>`;
                tbody.appendChild(tr);
            });
        }

        async function deleteToken(token) {
            await fetch(`/tokens/${token}`, { method: "DELETE" });
            loadTokens();
        }

        loadTokens();
    </script>
</body>
</html>
