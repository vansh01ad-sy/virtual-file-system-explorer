
#include <stdio.h>
#include <string.h>

int main(void)
{
    char command[100];

    while (1)
    {
        printf("COMMAND> ");
        fflush(stdout);

        if (fgets(command, sizeof(command), stdin) == NULL)
        {
            break;
        }

        command[strcspn(command, "\n")] = '\0';

        if (strcmp(command, "EXIT") == 0)
        {
            break;
        }

        char *separator = strchr(command, '|');

        if (separator == NULL)
        {
            printf("Invalid command format.\n");
            fflush(stdout);
            continue;
        }

        *separator = '\0';

        char *operation = command;
        char *argument = separator + 1;

        printf("Operation: %s\n", operation);
        printf("Argument: %s\n", argument);
        fflush(stdout);
    }

    return 0;
}
