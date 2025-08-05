// The models package - contains the web data.
package models

import (
	// Import time for timestamp fields
	"time"

	// Import GORM to insert gorm.Model (which provides ID and other base fields what helps us to manage our site).
	"gorm.io/gorm"
)

// The User struct represents the "users" table in the database.
type User struct {
	// gorm.Model adds fields like ID, CreatedAt, UpdatedAt, and DeletedAt.
	gorm.Model
	 
	// JSON tags make the fields use snake_case in API data instead of Go’s CamelCase.
	Name     string `json:"name"`
	Email    string `json:"email" gorm:"unique"`
	Password string `json:"password"`
	LastKeepAlive  time.Time `json:"last_keep_alive"`
}
