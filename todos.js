const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const store = require("connect-loki");
const PgPersistence = require("./lib/pg-persistence");
const catchError = require("./lib/catch-error");

const app = express();
const host = "localhost";
const port = 3000;
const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000, // 31 days in millseconds
    path: "/",
    secure: false,
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));

app.use(flash());

// Setup an objects with a connection to the database on each req/res cycle
// Obviously doesn't need to be persistent across cycles (since all data gets added or removed from the DB)
app.use((req, res, next) => {
  res.locals.store = new PgPersistence(req.session);
  next();
});

const requiresAuthentication = (req, res, next) => {
  if (!res.locals.signedIn) {
    console.log("Unauthorized.");
    res.redirect(302, "/users/signin");
  } else {
    next();
  }
}

// Extract session info
app.use((req, res, next) => {
  res.locals.signedIn = req.session.signedIn,
  res.locals.username = req.session.username,
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});


// Redirect start page
app.get("/", (req, res) => {
  res.redirect("/lists");
});

// Render the list of todo lists
app.get("/lists", requiresAuthentication, catchError(async (req, res) => {

  let store = res.locals.store;
  let todoLists = await store.sortedTodoLists();
  let todosInfo = todoLists.map(todoList => ({
    countAllTodos: todoList.todos.length,
    countDoneTodos: todoList.todos.filter(todo => todo.done).length,
    isDone: store.isDoneTodoList(todoList)
  }));

  res.render("lists", {
    todoLists,
    todosInfo,
  });
}));

// Render new todo list page
app.get("/lists/new", requiresAuthentication, (req, res) => {
  res.render("new-list");
});

// Create a new todo list 
app.post("/lists", requiresAuthentication,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let todoListId = req.params.todoListId;
    let title = req.body.todoListTitle;

    await body("todoListTitle")
          .trim()
          .isLength({ min: 1 })
          .withMessage("The list title is required.")
          .isLength({ max: 100 })
          .withMessage("The list title cannot be over 100 characters")
          .custom(title => {
            return store.todoListTitleExists(title).then(titleExists => {
              if (titleExists) {
                return Promise.reject('Title Already Exists');
              }
            })
          })
          .run(req)
    let errors = validationResult(req);

    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));   
      res.render("new-list", {
        title,
        flash: req.flash()
      })
    } else { 
      let resetTitle = await res.locals.store.createTodoList(title);
      if(!resetTitle) throw new Error("Couldn't create todo");
      req.flash("success", "Todo list updated.");
      res.redirect(`/lists`);
    }
}));

// Render individual todo list and its todos
app.get("/lists/:todoListId", requiresAuthentication,
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
    let todoList = await res.locals.store.loadTodoList(+todoListId);
    if (todoList === undefined) throw new Error("Not found.");

    todoList.todos = await res.locals.store.sortedTodos(todoList);

    res.render("list", {
      todoList,
      isDoneTodoList: res.locals.store.isDoneTodoList(todoList),
      hasUndoneTodos: res.locals.store.hasUndoneTodos(todoList),
    });
  })
);

// Toggle completion status of a todo
app.post("/lists/:todoListId/todos/:todoId/toggle", requiresAuthentication,
  catchError(async (req, res) => {

    let { todoListId, todoId } = req.params;
    let toggled = await res.locals.store.toggleDoneTodo(+todoListId, +todoId);
    if (!toggled) throw new Error("Not found.");

    let todo = await res.locals.store.loadTodo(+todoListId, +todoId);
    if (todo.done) {
      req.flash("success", `"${todo.title}" marked done.`);
    } else {
      req.flash("success", `"${todo.title}" marked as NOT done!`);
    }
  
    res.redirect(`/lists/${todoListId}`);
  })
)

// Complete All Todos
app.post("/lists/:todoListId/complete_all", requiresAuthentication,
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
    let markedCompleted = await res.locals.store.completeAll(+todoListId);
    if (!markedCompleted) throw new Error('Todo list not found')
    req.flash("success", "All todos marked as done");
    res.redirect(`/lists/${todoListId}`);
  })
)


app.post("/lists/:todoListId/todos/:todoId/destroy", 
  catchError(async (req, res) => {
    let { todoListId, todoId } = { ...req.params };
    let deleted = await res.locals.store.deleteTodo(+todoListId, +todoId);

    if (!deleted) throw new Error('Not Found');
    req.flash("success", "The todo has been deleted.");
    res.redirect(`/lists/${todoListId}`);
  })
)

// Add a new todo item
app.post("/lists/:todoListId/todos", requiresAuthentication,

  [
    body("todoTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The todo title is required.")
    .isLength({ max: 100 })
    .withMessage("Todo title must be between 1 and 100 characters."),
  ],
  
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
    let todoTitle = req.body.todoTitle;
    let todoList = await res.locals.store.loadTodoList(+todoListId);
    if (!todoList) {
      throw new Error ('Todolist not found');
    } else {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));
        res.render("list", {
          todoList,
          todoTitle,
          isDoneTodoList: res.locals.store.isDoneTodoList(todoList),
          hasUndoneTodos: res.locals.store.hasUndoneTodos(todoList),
          flash: req.flash(),
        });
     } else {
       let created = await res.locals.store.createTodo(+todoListId, todoTitle);
       if (!created) throw new Error ("Not found.");
       req.flash("success", "The todo has been created.");
       res.redirect(`/lists/${todoListId}`);
     }
    }}));

// Render edit todo list form
app.get("/lists/:todoListId/edit", 
    catchError(async (req, res) => {
      let todoListId = req.params.todoListId;
      let todoList = await res.locals.store.loadTodoList(+todoListId);
      if (!todoList) throw new Error('Not found');
      res.render("edit-list", { todoList })
    })
  )

app.post("/lists/:todoListId/destroy", requiresAuthentication,
    catchError(async (req, res) => {
      let todoListId = req.params.todoListId;
      let deleted = res.locals.store.deleteTodoList(+todoListId);
      if (!deleted) throw new Error('Item does not exist')
      req.flash("success", "Todo list deleted.");
      res.redirect("/lists");
    })
)

app.post("/lists/:todoListId/edit", requiresAuthentication,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let todoListId = req.params.todoListId;
    let title = req.body.todoListTitle;
    let todoList = await res.locals.store.loadTodoList(+todoListId)

    await body("todoListTitle")
          .trim()
          .isLength({ min: 1 })
          .withMessage("The list title is required.")
          .isLength({ max: 100 })
          .withMessage("The list title cannot be over 100 characters")
          .custom(title => {
            return store.todoListTitleExists(title).then(titleExists => {
              if (titleExists) {
                return Promise.reject('Title Already Exists');
              }
            })
          })
          .run(req)

    let errors = validationResult(req);

    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));   
      res.render("edit-list", {
        title,
        todoList,
        flash: req.flash()
      })
    } else { 
      let resetTitle = await res.locals.store.setTodoListTitle(+todoListId, title);
      if(!resetTitle) throw new Error("Todolist ID not found");
      req.flash("success", "Todo list updated.");
      res.redirect(`/lists/${todoListId}`);
    }
  }));

// Load the signin page
app.get('/users/signin', catchError(async (req, res) => {
  req.flash("info", "Please Sign In");
  res.render('sign-in', {
    flash: req.flash()
  });
}))

// Submit signin information
app.post('/users/signin', 
[
  body('username').trim()
],

catchError(catchError(async (req, res) => {
  let username = req.body.username;
  let password = req.body.password;

  // Query the database for the username and password

  if (await res.locals.store.authenticateUser(username, password)) {
    req.session.signedIn = true;
    req.session.username = username;
    req.flash('info', 'Welcome to your todolist')
    res.redirect('/lists');
  } else {
    req.flash('error', 'Invalid credentials');
    res.render('sign-in', {
      username,
      flash: req.flash(),
    })
  }
})))

app.post('/users/signout', (req, res) => {
  delete req.session.username;
  delete req.session.signedIn;
  res.redirect('/users/signin');
})

// Error handler
app.use((err, req, res, _next) => {
  console.log(err); // Writes more extensive information to the console log
  res.status(404).send(err.message);
});

// Listener
app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});