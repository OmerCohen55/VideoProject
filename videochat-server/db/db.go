// The db package - handles the connection between the Go server and the PostgreSQL database.
package db

import (
	"fmt"                     // For printing messages to the console
	"log"                     // For logging errors if the database connection fails
	"videochat-server/models" // Internal package containing model definitions (User, Call)

	"gorm.io/driver/postgres" // PostgreSQL driver for GORM
	"gorm.io/gorm"            // GORM - ORM library that simplifies database operations
)

// Global variable that stores the database connection so other files (like controllers)
// can use the same connection to interact with the database (for queries, inserts, updates)
// without opening a new connection each time.
var DB *gorm.DB

// Initializes the PostgreSQL database connection when the server starts.
func InitDB() {
	// DSN (Data Source Name) - holds all the connection details required by PostgreSQL.
	// The keys (host, user, password, dbname, port, sslmode) are fixed and cannot be renamed.
	dsn := "host=localhost user=postgres password=admin1234 dbname=videochat port=5432 sslmode=disable"

	// Opens the database connection using GORM with the PostgreSQL driver and DSN, and stores any error in 'err'.
	var err error
	// gorm.Open() - creates and returns a database connection object (DB).
	// postgres.Open(dsn) - specifies that we’re using the PostgreSQL driver with the DSN connection details.
	// &gorm.Config{} - passes a configuration object (empty here, so GORM uses default settings).
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})

	// If the connection fails, log the error and stop the server.
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Automatically creates or updates the "User" and "Call" tables based on the struct definitions in the models package.
	DB.AutoMigrate(&models.User{}, &models.Call{})

	// Prints a success message when the database connection is established.
	fmt.Println("Database connection established!")
}
