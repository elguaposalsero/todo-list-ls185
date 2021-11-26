const { dbQuery } = require("./db-query");
const bcrypt = require("bcrypt");

class PgPersistence {

  constructor(session) {
    this.username = session.username;
  }
  
  async sortedTodoLists() {
    const All_TODOLISTS = "  SELECT * FROM todolists" +
                          "   WHERE username = $1" +
                          "ORDER BY lower(title) ASC"
    
    
    const FIND_TODOS =    "  SELECT * FROM todos" +
                          "    JOIN todolists ON todolists.id = todos.todolist_id" +
                          "   WHERE todos.todolist_id = $1 AND username = $2"
  

    let result = await dbQuery(All_TODOLISTS, this.username);
    let todoLists = result.rows;

    for (let index = 0; index < todoLists.length; ++index) {
      let todoList = todoLists[index]; // This is a reference to the object
      let todos = await dbQuery(FIND_TODOS, todoList.id, this.username);
      todoList.todos = todos.rows; // Adding todos to the object
    }

    return this._partitionTodoLists(todoLists);
  }

  _partitionTodoLists(todoLists) {
    let undone = [];
    let done = [];

    todoLists.forEach(todoList => {
      if (this.isDoneTodoList(todoList)) {
        done.push(todoList);
      } else {
        undone.push(todoList);
      }
    });

    return undone.concat(done);
  }

  isDoneTodoList(todoList) {
    return todoList.todos.length > 0 && todoList.todos.every(todo => todo.done);
  }

  async loadTodoList(todoListId) {
    const FIND_TODO_LIST = `SELECT * FROM todolists WHERE id = $1 AND username = $2`

    const FIND_TODOS = "  SELECT todos.id, todos.title, todos.done, todos.todolist_id, todolists.username FROM todos" +
                       "    JOIN todolists ON todolists.id = todos.todolist_id" +
                       "   WHERE todos.todolist_id = $1 AND username = $2"
    
    let resultTodoList = dbQuery(FIND_TODO_LIST, todoListId, this.username);
    let resultTodos = dbQuery(FIND_TODOS, todoListId, this.username);
    let resultBoth = await Promise.all([resultTodoList, resultTodos]);

    let todoList = resultBoth[0].rows[0];
    if (!todoList) return undefined

    todoList.todos = resultBoth[1].rows;
    return todoList;
  }

  async loadTodo(todoListId, todoId) {
    const FIND_TODOS = "  SELECT * FROM todos" +
                       "    JOIN todolists ON todolists.id = todos.todolist_id" +
                       "   WHERE todos.todolist_id = $1 AND todos.id = $2 AND username = $3"
    
    let result = await dbQuery(FIND_TODOS, todoListId, todoId, this.username);
    return result.rows[0];
  }

  isDoneTodoList(todoList) {
    return todoList.todos.length > 0 && todoList.todos.every(todo => todo.done);
  }

  hasUndoneTodos(todoList) {
    return todoList.todos.some(todo => !todo.done)
  }

  async sortedTodos(todoList) {
    const FIND_SORTED_TODOS = "   SELECT todos.id, todos.title, todos.done, todos.todolist_id, todolists.username FROM todos" +
                              "     JOIN todolists ON todolists.id = todos.todolist_id" +
                              "    WHERE todos.todolist_id = $1 AND username = $2" +
                              " ORDER BY lower(todos.title) ASC"

    let todoListId = todoList.id;
    let result = await dbQuery(FIND_SORTED_TODOS, todoListId, this.username);
    return result.rows;
  }

  async toggleDoneTodo(todoListId, todoId) {
    
    const TOGGLE_DONE = "  UPDATE todos" +
                        "     SET done = NOT done" +
                        "    FROM todolists" +
                        "   WHERE todos.todolist_id = $1 AND todos.id = $2 AND todolists.username = $3"
    
    let result = await dbQuery(TOGGLE_DONE, todoListId, todoId, this.username);
    return result.rowCount > 0;
  }

  async deleteTodo(todoListId, todoId) {
    const DELETE_TODO = "DELETE FROM todos" +
                        " USING todolists" +
                        " WHERE todos.todolist_id = $1 AND todos.id = $2 AND todolists.username = $3"

    let results = await dbQuery(DELETE_TODO, todoListId, todoId, this.username);
    return (results.rowCount > 0);
  }

  async completeAll(todoListId) {
    const COMPLETE_TODOS =  "  UPDATE todos" +
                            "     SET done = true" +
                            "    FROM todolists" +
                            "   WHERE todos.todolist_id = $1 AND username = $2"

    let results = await dbQuery(COMPLETE_TODOS, todoListId, this.username);
    return results.rowCount > 0;
  }

  async createTodo(todoListId, todoTitle) {
    const ADD_TODO = `INSERT INTO todos (todolist_id, title) VALUES($1, $2)`;
    let results = await dbQuery(ADD_TODO, todoListId, todoTitle);
    return results.rowCount > 0;
  }

  async deleteTodoList(todoListId) {
    const DELETE_TODO = `DELETE FROM todolists WHERE id = $1 AND username = $2`
    let results = await dbQuery(DELETE_TODO, todoListId, this.username);
    return results.rowCount > 0;
  }

  async setTodoListTitle(todoListId, title) {
    const SET_TITLE = `UPDATE todolists SET title = $1 WHERE id = $2 AND username = $3`
    let results = await dbQuery(SET_TITLE, title, todoListId, this.username);
    return results.rowCount > 0;
  }

  async createTodoList(title) {
    const CREATE_TITLE = `INSERT INTO todolists (title, username) VALUES ($1, $2)`
    let results = await dbQuery(CREATE_TITLE, title, this.username);
    if(results.rowCount > 0) return true;
    return false;
  }

  async todoListTitleExists(title) {
    const TODO_TITLE = `SELECT * FROM todolists WHERE title = $1 AND username = $2`
    let results = await dbQuery(TODO_TITLE, title, this.username);
    if(results.rowCount > 0) return true;
    return false;
  }

  async authenticateUser(username, password) {
    const FIND_HASHED_PASSWORD = "SELECT password FROM users" +
                                 " WHERE username = $1"
    
    let result = await dbQuery(FIND_HASHED_PASSWORD, username);
    // First check whether username exists. If it doesn't you don't need to use bcrypt
    if (result.rowCount === 0) return false
    
    return await bcrypt.compare(password, result.rows[0].password);

  }

}

module.exports = PgPersistence;