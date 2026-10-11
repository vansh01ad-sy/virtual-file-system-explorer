#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define FOLDER 0        
#define FILE_TYPE 1     

#define HISTORY_LIMIT 100

typedef struct Node {   
    char name[50];
    int type;
    struct Node *firstChild;
    struct Node *nextSibling;
    struct Node *parent;
}Node;




void recordVisit(Node *history[], int *count,
                 int *index, Node *folder)
{
    /* Remove the forward history after the current position */
    *count = *index + 1;

    /* If history is full, discard the oldest entry */
    if(*count == HISTORY_LIMIT)
    {
        for(int i = 1; i < HISTORY_LIMIT; i++)
        {
            history[i - 1] = history[i];
        }

        *count = HISTORY_LIMIT - 1;
        (*index)--;
    }

    /* Record the new location */
    history[*count] = folder;
    *index = *count;
    (*count)++;
}


void printPath(Node *currentFolder)
{
    Node *path[100];
    int depth = 0;

    Node *temp = currentFolder;

    while (temp != NULL && depth < 100) {
        path[depth] = temp;
        depth++;
        temp = temp->parent;
    }

    for (int i = depth - 1; i >= 0; i--) {
        printf("%s", path[i]->name);

        if (i > 0 && i < depth-1) {
            printf("/");
        }
    }
}


Node *createNode(char *name , int type){
    Node *newNode = (Node*)malloc(sizeof(Node));
    if (newNode == NULL){
        printf("Memory allocation failed\n");
        return NULL; 
    }
    strcpy(newNode->name, name);
    newNode->type = type;
    newNode->firstChild = NULL;             //initially set both null cause node has no child or sibling when created ;
    newNode->nextSibling = NULL;
    newNode->parent = NULL;

    return newNode;
}

void addChild (Node *parent , Node *child) {
    child->parent = parent;
    if(parent->firstChild == NULL){
        parent->firstChild = child;
        return;
    }
    Node *current = parent->firstChild;
    while(current->nextSibling!= NULL){
        current = current->nextSibling;
    }
    current->nextSibling = child;
}


int main(){
    Node *root = createNode("/", FOLDER);
    if(root == NULL){
        printf("Unable to create root folder!");
        return 1;
    }
    Node *currentFolder = root;   //indicate in which folder we are 
    int choice ; 
    char name[50];

   

    Node *history[HISTORY_LIMIT];
    int historyCount = 1;
    int historyIndex = 0;

    history[0] = root;

    
char command[100];

while (1)
{
    printf("COMMAND> ");
    fflush(stdout);

    if (fgets(command, sizeof(command), stdin) == NULL)
        break;

    command[strcspn(command, "\n")] = '\0';

    if (strcmp(command, "EXIT") == 0)
        break;

    if (strcmp(command, "PATH") == 0)
    {
        printf("PATH|");
        printPath(currentFolder);
        printf("\n");
        fflush(stdout);
    }
    else if (strcmp(command, "LIST") == 0)
    {
        Node *current = currentFolder->firstChild;

        while (current != NULL)
        {
            printf("ITEM|%s|%d\n", current->name, current->type);
            current = current->nextSibling;
        }

        printf("LIST_END\n");
        fflush(stdout);
    }
    
else if (strncmp(command, "CREATE_FOLDER|", 14) == 0)
{
    char *name = command + 14;

    if (*name == '\0')
    {
        printf("ERROR|Folder name required\n");
    }
    else
    {
        Node *folder = createNode(name, FOLDER);

        if (folder == NULL)
        {
            printf("ERROR|Memory allocation failed\n");
        }
        else
        {
            addChild(currentFolder, folder);
            printf("OK|Folder created|%s\n", name);
        }
    }

    fflush(stdout);
}
        else if (strncmp(command, "CREATE_FILE|", 12) == 0)
        {
            char *name = command + 12;

            if (*name == '\0')
            {
                printf("ERROR|File name required\n");
            }
            else
            {
                Node *file = createNode(name, FILE_TYPE);

                if (file == NULL)
                {
                    printf("ERROR|Memory allocation failed\n");
                }
                else
                {
                    addChild(currentFolder, file);
                    printf("OK|File created|%s\n", name);
                }
            }

            fflush(stdout);
        }
        
        else if (strncmp(command, "OPEN_FOLDER|", 12) == 0)
        {
            char *name = command + 12;
            Node *current = currentFolder->firstChild;

            while (current != NULL)
            {
                if (strcmp(current->name, name) == 0 &&
                    current->type == FOLDER)
                {
                    recordVisit(history, &historyCount,
                                &historyIndex, current);

                    currentFolder = current;
                    printf("OK|Folder opened|%s\n", currentFolder->name);
                    break;
                }

                current = current->nextSibling;
            }

            if (current == NULL)
                printf("ERROR|Folder not found\n");

            fflush(stdout);
        }
        else if (strcmp(command, "BACK") == 0)
        {
            if (historyIndex > 0)
            {
                historyIndex--;
                currentFolder = history[historyIndex];
                printf("OK|Moved back\n");
            }
            else
            {
                printf("ERROR|No previous location\n");
            }

            fflush(stdout);
        }
        else if (strcmp(command, "FORWARD") == 0)
        {
            if (historyIndex < historyCount - 1)
            {
                historyIndex++;
                currentFolder = history[historyIndex];
                printf("OK|Moved forward\n");
            }
            else
            {
                printf("ERROR|No forward location\n");
            }

            fflush(stdout);
        }

        else
        {
            printf("ERROR|Unknown command\n");
            fflush(stdout);
        }

}
return 0 ;
}