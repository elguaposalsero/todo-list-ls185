const SeedData = require("./seed-data");
const deepCopy = require("./deep-copy");
const { sortTodoLists, sortTodos } = require("./sort");
const nextId = require('./next-id')

// The issue from this is that it won't persist through sessions right?
// That's because for each req/res cycle we will start with an empty session variable I think?
// Unless there's a data store and this session object is somehow permanent? 

module.exports = class SessionPersistence {
  constructor(session) {
    this._todoLists = session.todoLists || deepCopy(SeedData);
    session.todoLists = this._todoLists;
  }

  loadTodoList(todoListId) {
    let todoList = this._findTodoList(todoListId);
    return deepCopy(todoList);
  }

  isDoneTodoList(todoList) {
    return todoList.todos.length > 0 && todoList.todos.every(todo => todo.done);
  }

  sortedTodoLists() {
    let todoLists = deepCopy(this._todoLists);
    let undone = todoLists.filter(todoList => !this.isDoneTodoList(todoList));
    let done = todoLists.filter(todoList => this.isDoneTodoList(todoList));
    return sortTodoLists(undone, done);
  }

  sortedTodos(todoList) {
    let todos = todoList.todos;
    let undone = todos.filter(todo => !todo.done);
    let done = todos.filter(todo => todo.done);
    return deepCopy(sortTodos(undone, done));
  }

  hasUndoneTodos(todoList) {
    return todoList.todos.some(todo => !todo.done);
  }

  loadTodo(todoListId, todoId) {
    let todo = this._findTodo(todoListId, todoId);
    return deepCopy(todo);
  }

  toggleDoneTodo(todoListId, todoId) {
    let todo = this._findTodo(todoListId, todoId);
    if (!todo) return false; 
    
    todo.done = !todo.done;
    return true;
  }

  deleteTodo(todoListId, todoId) {
    let todoList = this._findTodoList(todoListId);
    let todoIndexById = this._todoIndexById(todoList, todoId);
    if (!this._todoIndexById) return false;

    todoList.todos.splice(todoIndexById, 1);
    return true
  }

  deleteTodoList(todoListId) {
    console.log(this._todoLists);
    let index = 0;
    while (index < this._todoLists.length) {
      if (this._todoLists[index].id === todoListId) {
        this._todoLists.splice(index, 1);
        console.log(this._todoLists)
        return true;
      }
      index += 1;
    }
    return false;
  }

  completeAllTodos(todoListId) {
    let todoList = this._findTodoList(todoListId);
    if (todoList) {
      todoList.todos.forEach(todo => todo.done = true);
      return true;
    }
    return false;
  }

  _todoIndexById(todoList, todoId) {
    let index = 0;
    while (index < todoList.todos.length) {
      if (todoList.todos[index].id === todoId) {
        return index;
      }
      index += 1;
    }
    return undefined;
  }

  _findTodoList(todoListId) {
    return this._todoLists.find(todoList => todoList.id === todoListId);
  }

  _findTodo(todoListId, todoId) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return undefined;
    return todoList.todos.find(todo => todo.id === todoId);
  }

  createTodo(todoListId, todoItemTitle) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return false;
    
    todoList.todos.push({ 
      id: nextId(), 
      title: todoItemTitle, 
      done: false, 
    })

    return true;
  }

  setTodoListTitle(todoListId, title) {
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return false;

    todoList.title = title;
    return true;
  }

  // Returns `true` if a todo list with the specified title exists in the list
  // of todo lists, `false` otherwise.
  existsTodoListTitle(title) {
    return this._todoLists.some(todoList => todoList.title === title);
  }

  createTodoList(title) {
    this._todoLists.push({
      title,
      id: nextId(),
      todos: [],
    });

    return true;
  }
};
